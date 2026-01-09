#!/usr/bin/env npx ts-node

/**
 * UI Bug Scanner - Main Orchestrator
 * Coordinates crawling, analysis, and reporting
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import {
  ScanInput,
  ScanOutput,
  ScanSummary,
  ScanArtifacts,
  ScanError,
  Finding,
  PageScanResult,
  ViewportConfig,
  ViewportPreset,
  VIEWPORT_PRESETS,
  Severity,
  FindingCategory,
  SpecRuleset,
} from './types';
import { BrowserRunner } from './utils/browser';
import { EvidenceCollector } from './utils/evidence';
import { deduplicateFindings, getTopFindings } from './utils/dedup';
import { AccessibilityAnalyzer } from './analyzers/accessibility';
import { UsabilityAnalyzer } from './analyzers/usability';
import { SpecAnalyzer, createDefaultRuleset } from './analyzers/spec';
import { getUrlsFromSitemap } from './crawlers/sitemap';
import { BfsCrawler } from './crawlers/bfs';
import { generateMarkdownReport } from './reporters/markdown';
import { generateJsonReport } from './reporters/json';
import { generateSarifReport } from './reporters/sarif';

export interface ScannerOptions {
  headless?: boolean;
  timeout?: number;
  concurrency?: number;
  verbose?: boolean;
}

export class Scanner {
  private options: ScannerOptions;
  private browser: Browser | null = null;

  constructor(options: ScannerOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      concurrency: 3,
      verbose: false,
      ...options,
    };
  }

  async scan(input: ScanInput): Promise<ScanOutput> {
    const startTime = new Date();
    const outputDir = input.outputDir || './reports';
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(outputDir, 'screenshots'), { recursive: true });

    // Initialize components
    const evidenceCollector = new EvidenceCollector(outputDir);
    await evidenceCollector.init();

    const accessibilityAnalyzer = new AccessibilityAnalyzer(evidenceCollector, {
      wcagVersion: input.standards?.wcag?.includes('2.2') ? '2.2' : '2.1',
      wcagLevel: 'AA',
    });

    const usabilityAnalyzer = new UsabilityAnalyzer(evidenceCollector);

    const specAnalyzer = new SpecAnalyzer(evidenceCollector);
    if (input.customSpecs) {
      await specAnalyzer.loadRules(input.customSpecs);
    } else {
      // Load default rules
      await specAnalyzer.loadRules(createDefaultRuleset());
    }

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.options.headless,
    });

    try {
      // Discover URLs to scan
      const urls = await this.discoverUrls(input);
      this.log(`Discovered ${urls.length} URLs to scan`);

      // Get viewports to test
      const viewports = (input.viewports || ['desktop']).map(
        (v) => VIEWPORT_PRESETS[v]
      );

      // Generate scan jobs
      const jobs: Array<{ url: string; viewport: ViewportConfig }> = [];
      for (const url of urls) {
        for (const viewport of viewports) {
          jobs.push({ url, viewport });
        }
      }

      this.log(`Created ${jobs.length} scan jobs`);

      // Execute scan jobs
      const allFindings: Finding[] = [];
      const errors: Array<{ pageUrl: string; viewport: string; error: string; timestamp: string }> = [];
      let completedJobs = 0;

      // Process jobs with concurrency limit
      const batchSize = this.options.concurrency || 3;
      for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((job) =>
            this.scanPage(
              job.url,
              job.viewport,
              input,
              accessibilityAnalyzer,
              usabilityAnalyzer,
              specAnalyzer,
              evidenceCollector
            )
          )
        );

        for (const result of results) {
          completedJobs++;
          this.log(`[${completedJobs}/${jobs.length}] Scanned ${result.job.url} (${result.job.viewport.name})`);

          if (result.error) {
            errors.push({
              pageUrl: result.job.url,
              viewport: result.job.viewport.name,
              error: result.error,
              timestamp: new Date().toISOString(),
            });
          } else {
            allFindings.push(...result.findings);
          }
        }
      }

      const endTime = new Date();
      const duration = this.formatDuration(endTime.getTime() - startTime.getTime());

      // Deduplicate findings
      const dedupedFindings = deduplicateFindings(allFindings);
      this.log(`Found ${allFindings.length} total findings, ${dedupedFindings.length} unique`);

      // Build summary
      const summary: ScanSummary = this.buildSummary(
        urls.length,
        duration,
        startTime.toISOString(),
        endTime.toISOString(),
        dedupedFindings,
        viewports.map((v) => v.name),
        errors
      );

      // Generate reports
      const artifacts = await this.generateReports(
        outputDir,
        summary,
        dedupedFindings,
        input.outputFormats || ['json', 'markdown']
      );

      // Get top findings for summary
      const topFindings = getTopFindings(dedupedFindings, 10);

      return {
        summary,
        artifacts,
        topFindings,
        allFindings: dedupedFindings,
      };
    } finally {
      await this.browser?.close();
      this.browser = null;
    }
  }

  private async discoverUrls(input: ScanInput): Promise<string[]> {
    const urls: string[] = [];
    const crawlMode = input.crawlMode || 'single';

    switch (crawlMode) {
      case 'single':
        urls.push(...input.startUrls);
        break;

      case 'sitemap':
        for (const startUrl of input.startUrls) {
          const sitemapUrls = await getUrlsFromSitemap(startUrl, {
            maxUrls: input.maxPages || 50,
            allowDomains: input.allowDomains,
            denyPatterns: input.denyPatterns,
          });
          urls.push(...sitemapUrls);
        }
        break;

      case 'bfs':
        if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
        }
        const context = await this.browser.newContext();
        const page = await context.newPage();

        try {
          const bfsCrawler = new BfsCrawler({
            maxPages: input.maxPages || 50,
            maxDepth: input.maxDepth || 3,
            allowDomains: input.allowDomains,
            denyPatterns: input.denyPatterns,
          });

          for (const startUrl of input.startUrls) {
            const crawledUrls = await bfsCrawler.crawl(startUrl, page);
            urls.push(...crawledUrls);
            bfsCrawler.reset();
          }
        } finally {
          await context.close();
        }
        break;

      case 'journey':
        // Journey mode: just scan the start URLs, interactions are handled per-page
        urls.push(...input.startUrls);
        break;
    }

    // Apply limits and filters
    let filteredUrls = [...new Set(urls)]; // Dedupe

    if (input.maxPages && filteredUrls.length > input.maxPages) {
      filteredUrls = filteredUrls.slice(0, input.maxPages);
    }

    return filteredUrls;
  }

  private async scanPage(
    url: string,
    viewport: ViewportConfig,
    input: ScanInput,
    a11yAnalyzer: AccessibilityAnalyzer,
    usabilityAnalyzer: UsabilityAnalyzer,
    specAnalyzer: SpecAnalyzer,
    evidenceCollector: EvidenceCollector
  ): Promise<PageScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];
    let error: string | undefined;
    let screenshotPath: string | undefined;

    const context = await this.browser!.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: input.locales?.[0] || 'en-US',
      isMobile: viewport.name === 'mobile',
      hasTouch: viewport.name === 'mobile' || viewport.name === 'tablet',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(this.options.timeout || 30000);

    try {
      // Apply auth if provided
      if (input.auth?.cookies) {
        await context.addCookies(
          input.auth.cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: c.secure ?? true,
            httpOnly: c.httpOnly ?? false,
          }))
        );
      }

      if (input.auth?.headers) {
        await page.setExtraHTTPHeaders(input.auth.headers);
      }

      // Execute login steps if provided
      if (input.auth?.loginSteps) {
        for (const step of input.auth.loginSteps) {
          await this.executeLoginStep(page, step);
        }
      }

      // Navigate to page
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });

      // Wait for page stability
      await this.waitForStability(page);

      // Execute interaction plan if provided
      if (input.interactionPlan) {
        for (const step of input.interactionPlan) {
          await this.executeInteraction(page, step);
        }
      }

      // Capture full page screenshot
      screenshotPath = await evidenceCollector.captureFullPage(page, url, viewport.name);

      // Run analyzers
      const [a11yResult, usabilityResult, specResult] = await Promise.all([
        a11yAnalyzer.analyze(page, url, viewport),
        usabilityAnalyzer.analyze(page, url, viewport),
        specAnalyzer.analyze(page, url, viewport),
      ]);

      findings.push(...a11yResult.findings);
      findings.push(...usabilityResult.findings);
      findings.push(...specResult.findings);

      // Capture element screenshots for findings (limit to avoid overwhelming)
      const criticalFindings = findings.filter(
        (f) => f.severity === 'critical' || f.severity === 'high'
      );
      for (const finding of criticalFindings.slice(0, 10)) {
        if (finding.evidence.selectors.length > 0) {
          const elementScreenshot = await evidenceCollector.captureElement(
            page,
            finding.evidence.selectors[0],
            url,
            viewport.name,
            finding.ruleId || 'finding'
          );
          if (elementScreenshot) {
            finding.evidence.screenshotPath = elementScreenshot;
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      await context.close();
    }

    return {
      job: { url, viewport },
      findings,
      error,
      screenshotPath,
      duration: Date.now() - startTime,
    };
  }

  private async executeLoginStep(
    page: Page,
    step: { action: string; url?: string; selector?: string; value?: string; timeout?: number }
  ): Promise<void> {
    switch (step.action) {
      case 'navigate':
        if (step.url) {
          await page.goto(step.url, { waitUntil: 'networkidle' });
        }
        break;
      case 'type':
        if (step.selector && step.value) {
          const value = step.value.replace(/\$\{(\w+)\}/g, (_, name) =>
            process.env[name] || ''
          );
          await page.fill(step.selector, value);
        }
        break;
      case 'click':
        if (step.selector) {
          await page.click(step.selector);
        }
        break;
      case 'waitForNavigation':
        await page.waitForLoadState('networkidle', { timeout: step.timeout });
        break;
      case 'waitForSelector':
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: step.timeout });
        }
        break;
    }
  }

  private async executeInteraction(
    page: Page,
    step: { action: string; selector?: string; value?: string; key?: string; duration?: number; x?: number; y?: number }
  ): Promise<void> {
    switch (step.action) {
      case 'click':
        if (step.selector) {
          await page.click(step.selector);
          await page.waitForTimeout(300);
        }
        break;
      case 'type':
        if (step.selector && step.value) {
          await page.fill(step.selector, step.value);
        }
        break;
      case 'hover':
        if (step.selector) {
          await page.hover(step.selector);
        }
        break;
      case 'scroll':
        if (step.x !== undefined && step.y !== undefined) {
          await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: step.x, y: step.y });
        } else if (step.selector) {
          await page.locator(step.selector).scrollIntoViewIfNeeded();
        }
        break;
      case 'wait':
        await page.waitForTimeout(step.duration || 1000);
        break;
      case 'press':
        if (step.key) {
          await page.keyboard.press(step.key);
        }
        break;
    }
  }

  private async waitForStability(page: Page, timeout = 3000): Promise<void> {
    const start = Date.now();
    let lastHtml = '';

    while (Date.now() - start < timeout) {
      const currentHtml = await page.content();
      if (currentHtml === lastHtml) {
        return;
      }
      lastHtml = currentHtml;
      await page.waitForTimeout(100);
    }
  }

  private buildSummary(
    pagesScanned: number,
    duration: string,
    startTime: string,
    endTime: string,
    findings: Finding[],
    viewports: string[],
    errors: Array<{ pageUrl: string; viewport: string; error: string; timestamp: string }>
  ): ScanSummary {
    const findingsBySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const findingsByCategory: Record<FindingCategory, number> = {
      accessibility: 0,
      usability: 0,
      spec: 0,
    };

    for (const finding of findings) {
      findingsBySeverity[finding.severity]++;
      findingsByCategory[finding.category]++;
    }

    return {
      pagesScanned,
      scanDuration: duration,
      startTime,
      endTime,
      findings: findingsBySeverity,
      byCategory: findingsByCategory,
      viewportsScanned: viewports as ViewportPreset[],
      errors: errors as ScanError[],
    };
  }

  private async generateReports(
    outputDir: string,
    summary: ScanSummary,
    findings: Finding[],
    formats: string[]
  ): Promise<ScanArtifacts> {
    const artifacts: ScanArtifacts = {
      screenshotsDir: path.join(outputDir, 'screenshots'),
    };

    for (const format of formats) {
      switch (format) {
        case 'markdown':
          const markdownReport = generateMarkdownReport(summary, findings);
          const mdPath = path.join(outputDir, 'report.md');
          await fs.writeFile(mdPath, markdownReport);
          artifacts.reportMarkdownPath = mdPath;
          break;

        case 'json':
          const jsonReport = generateJsonReport(summary, findings, artifacts);
          const jsonPath = path.join(outputDir, 'findings.json');
          await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
          artifacts.findingsJsonPath = jsonPath;
          break;

        case 'sarif':
          const sarifReport = generateSarifReport(findings);
          const sarifPath = path.join(outputDir, 'findings.sarif.json');
          await fs.writeFile(sarifPath, JSON.stringify(sarifReport, null, 2));
          artifacts.sarifPath = sarifPath;
          break;
      }
    }

    return artifacts;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[Scanner] ${message}`);
    }
  }
}

/**
 * Main function for CLI usage
 */
export async function scanWebsite(input: ScanInput): Promise<ScanOutput> {
  const scanner = new Scanner({ verbose: true });
  return await scanner.scan(input);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Simple CLI argument parsing
  const input: ScanInput = {
    startUrls: [],
    outputDir: './reports',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--url':
      case '-u':
        if (nextArg) {
          input.startUrls.push(nextArg);
          i++;
        }
        break;
      case '--crawl-mode':
      case '-c':
        if (nextArg) {
          input.crawlMode = nextArg as any;
          i++;
        }
        break;
      case '--max-pages':
      case '-m':
        if (nextArg) {
          input.maxPages = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--viewport':
      case '-v':
        if (nextArg) {
          input.viewports = nextArg.split(',') as any;
          i++;
        }
        break;
      case '--output':
      case '-o':
        if (nextArg) {
          input.outputDir = nextArg;
          i++;
        }
        break;
      case '--specs':
      case '-s':
        if (nextArg) {
          input.customSpecs = nextArg;
          i++;
        }
        break;
      case '--format':
      case '-f':
        if (nextArg) {
          input.outputFormats = nextArg.split(',') as any;
          i++;
        }
        break;
      case '--help':
      case '-h':
        console.log(`
UI Bug Scanner - Website Accessibility and Usability Scanner

Usage: npx ts-node scanner.ts [options]

Options:
  --url, -u <url>           URL to scan (can be repeated)
  --crawl-mode, -c <mode>   Crawl mode: single, sitemap, bfs, journey (default: single)
  --max-pages, -m <n>       Maximum pages to scan (default: 10)
  --viewport, -v <list>     Viewports: desktop,tablet,mobile (default: desktop)
  --output, -o <dir>        Output directory (default: ./reports)
  --specs, -s <path>        Path to custom spec rules JSON
  --format, -f <list>       Output formats: json,markdown,sarif (default: json,markdown)
  --help, -h                Show this help message

Examples:
  npx ts-node scanner.ts --url https://example.com
  npx ts-node scanner.ts --url https://example.com --viewport desktop,mobile --crawl-mode sitemap
  npx ts-node scanner.ts --url https://example.com --specs ./my-specs.json --format json,sarif
        `);
        process.exit(0);
    }
  }

  if (input.startUrls.length === 0) {
    console.error('Error: At least one --url is required');
    process.exit(1);
  }

  console.log('Starting UI Bug Scanner...');
  console.log(`URLs: ${input.startUrls.join(', ')}`);
  console.log(`Crawl Mode: ${input.crawlMode || 'single'}`);
  console.log(`Viewports: ${(input.viewports || ['desktop']).join(', ')}`);
  console.log('');

  scanWebsite(input)
    .then((result) => {
      console.log('\n=== Scan Complete ===\n');
      console.log(`Pages Scanned: ${result.summary.pagesScanned}`);
      console.log(`Duration: ${result.summary.scanDuration}`);
      console.log('');
      console.log('Findings:');
      console.log(`  Critical: ${result.summary.findings.critical}`);
      console.log(`  High: ${result.summary.findings.high}`);
      console.log(`  Medium: ${result.summary.findings.medium}`);
      console.log(`  Low: ${result.summary.findings.low}`);
      console.log(`  Info: ${result.summary.findings.info}`);
      console.log('');
      console.log('Reports generated:');
      if (result.artifacts.reportMarkdownPath) {
        console.log(`  Markdown: ${result.artifacts.reportMarkdownPath}`);
      }
      if (result.artifacts.findingsJsonPath) {
        console.log(`  JSON: ${result.artifacts.findingsJsonPath}`);
      }
      if (result.artifacts.sarifPath) {
        console.log(`  SARIF: ${result.artifacts.sarifPath}`);
      }

      // Exit with error code if critical issues found
      if (result.summary.findings.critical > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Scan failed:', error);
      process.exit(1);
    });
}
