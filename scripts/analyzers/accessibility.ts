/**
 * Accessibility Analyzer
 * Uses axe-core for WCAG 2.x AA compliance checking
 */

import { Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {
  Finding,
  FindingEvidence,
  Severity,
  Confidence,
  WCAGReference,
  ViewportConfig,
  AnalyzerResult,
} from '../types';
import { EvidenceCollector } from '../utils/evidence';

// axe-core severity to our severity mapping
const AXE_IMPACT_TO_SEVERITY: Record<string, Severity> = {
  critical: 'critical',
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
};

// axe-core rule to WCAG SC mapping (partial - axe provides this in results)
const AXE_RULE_WCAG_MAP: Record<string, string[]> = {
  'color-contrast': ['1.4.3'],
  'color-contrast-enhanced': ['1.4.6'],
  'image-alt': ['1.1.1'],
  'input-image-alt': ['1.1.1'],
  'label': ['1.3.1', '4.1.2'],
  'button-name': ['4.1.2'],
  'link-name': ['2.4.4', '4.1.2'],
  'aria-label': ['4.1.2'],
  'aria-labelledby': ['4.1.2'],
  'aria-hidden-focus': ['4.1.2'],
  'aria-required-attr': ['4.1.2'],
  'aria-required-children': ['4.1.2'],
  'aria-required-parent': ['4.1.2'],
  'aria-roles': ['4.1.2'],
  'aria-valid-attr': ['4.1.2'],
  'aria-valid-attr-value': ['4.1.2'],
  'focus-order-semantics': ['2.4.3'],
  'tabindex': ['2.4.3'],
  'bypass': ['2.4.1'],
  'document-title': ['2.4.2'],
  'duplicate-id': ['4.1.1'],
  'duplicate-id-active': ['4.1.1'],
  'form-field-multiple-labels': ['1.3.1'],
  'heading-order': ['1.3.1'],
  'empty-heading': ['1.3.1', '2.4.6'],
  'html-has-lang': ['3.1.1'],
  'html-lang-valid': ['3.1.1'],
  'meta-viewport': ['1.4.4'],
  'landmark-one-main': ['1.3.1'],
  'region': ['1.3.1'],
};

export interface AccessibilityAnalyzerOptions {
  wcagVersion: '2.1' | '2.2';
  wcagLevel: 'AA' | 'AAA';
  rules?: string[];
  disableRules?: string[];
}

export class AccessibilityAnalyzer {
  private options: AccessibilityAnalyzerOptions;
  private evidenceCollector: EvidenceCollector;

  constructor(
    evidenceCollector: EvidenceCollector,
    options: Partial<AccessibilityAnalyzerOptions> = {}
  ) {
    this.options = {
      wcagVersion: '2.1',
      wcagLevel: 'AA',
      ...options,
    };
    this.evidenceCollector = evidenceCollector;
  }

  async analyze(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<AnalyzerResult> {
    const findings: Finding[] = [];

    try {
      // Run axe-core analysis
      const axeBuilder = new AxeBuilder({ page })
        .withTags([
          'wcag2a',
          'wcag2aa',
          this.options.wcagVersion === '2.2' ? 'wcag22aa' : 'wcag21aa',
          'best-practice',
        ]);

      // Apply rule customization if provided
      if (this.options.rules?.length) {
        axeBuilder.withRules(this.options.rules);
      }
      if (this.options.disableRules?.length) {
        axeBuilder.disableRules(this.options.disableRules);
      }

      const results = await axeBuilder.analyze();

      // Process violations (certain failures)
      for (const violation of results.violations) {
        for (const node of violation.nodes) {
          const finding = await this.createFinding(
            violation,
            {
              target: node.target.map(t => typeof t === 'string' ? t : String(t)),
              html: node.html,
              failureSummary: node.failureSummary,
              any: node.any,
              all: node.all,
              none: node.none,
            },
            pageUrl,
            viewport,
            'certain'
          );
          findings.push(finding);
        }
      }

      // Process incomplete (likely issues, need human review)
      for (const incomplete of results.incomplete) {
        for (const node of incomplete.nodes) {
          const finding = await this.createFinding(
            incomplete,
            {
              target: node.target.map(t => typeof t === 'string' ? t : String(t)),
              html: node.html,
              failureSummary: node.failureSummary,
              any: node.any,
              all: node.all,
              none: node.none,
            },
            pageUrl,
            viewport,
            'needs_review'
          );
          findings.push(finding);
        }
      }

      // Additional custom checks not covered by axe
      const customFindings = await this.runCustomChecks(page, pageUrl, viewport);
      findings.push(...customFindings);

    } catch (error) {
      console.error('Accessibility analysis error:', error);
    }

    return { findings };
  }

  private async createFinding(
    rule: {
      id: string;
      impact?: string | null;
      description: string;
      help: string;
      helpUrl: string;
      tags?: string[];
    },
    node: {
      target: string[];
      html: string;
      failureSummary?: string;
      any?: Array<{ message: string }>;
      all?: Array<{ message: string }>;
      none?: Array<{ message: string }>;
    },
    pageUrl: string,
    viewport: ViewportConfig,
    confidence: Confidence
  ): Promise<Finding> {
    const selector = node.target[0] || 'unknown';
    const severity = AXE_IMPACT_TO_SEVERITY[rule.impact || 'moderate'] || 'medium';

    // Build WCAG reference
    const wcagCriteria = this.extractWcagCriteria(rule);

    // Collect evidence
    const evidence: FindingEvidence = {
      selectors: node.target,
      domSnippet: this.truncateHtml(node.html),
    };

    // Generate failure description
    const failureDetails = this.formatFailureDetails(node);

    const finding: Finding = {
      id: this.evidenceCollector.generateFindingId(
        rule.id,
        selector,
        pageUrl,
        viewport.name
      ),
      category: 'accessibility',
      severity,
      confidence,
      pageUrl,
      viewport: viewport.name,
      title: rule.help,
      description: `${rule.description}\n\n${failureDetails}`,
      stepsToReproduce: [
        `Navigate to ${pageUrl}`,
        `Locate element: ${selector}`,
        `Inspect the element for accessibility issues`,
      ],
      expected: this.getExpectedBehavior(rule.id),
      actual: node.failureSummary || 'Element fails accessibility check',
      evidence,
      wcag: wcagCriteria,
      tool: 'axe-core',
      ruleId: rule.id,
      suggestedFix: this.getSuggestedFix(rule.id, node),
      references: [rule.helpUrl],
    };

    return finding;
  }

  private extractWcagCriteria(rule: {
    id: string;
    tags?: string[];
  }): WCAGReference | undefined {
    // Extract from axe tags or our mapping
    const criteria: string[] = [];

    // Check our mapping first
    if (AXE_RULE_WCAG_MAP[rule.id]) {
      criteria.push(...AXE_RULE_WCAG_MAP[rule.id]);
    }

    // Also check axe tags for wcag references
    if (rule.tags) {
      for (const tag of rule.tags) {
        const match = tag.match(/wcag(\d)(\d)(\d)/);
        if (match) {
          criteria.push(`${match[1]}.${match[2]}.${match[3]}`);
        }
      }
    }

    if (criteria.length === 0) return undefined;

    return {
      version: this.options.wcagVersion,
      level: this.options.wcagLevel,
      successCriteria: [...new Set(criteria)],
    };
  }

  private formatFailureDetails(node: {
    any?: Array<{ message: string }>;
    all?: Array<{ message: string }>;
    none?: Array<{ message: string }>;
  }): string {
    const details: string[] = [];

    if (node.any?.length) {
      details.push('Fix any of the following:');
      node.any.forEach((check) => details.push(`  - ${check.message}`));
    }

    if (node.all?.length) {
      details.push('Fix all of the following:');
      node.all.forEach((check) => details.push(`  - ${check.message}`));
    }

    if (node.none?.length) {
      details.push('Element must not:');
      node.none.forEach((check) => details.push(`  - ${check.message}`));
    }

    return details.join('\n');
  }

  private getExpectedBehavior(ruleId: string): string {
    const expectations: Record<string, string> = {
      'color-contrast': 'Text should have a contrast ratio of at least 4.5:1 for normal text or 3:1 for large text',
      'image-alt': 'Images should have meaningful alt text or be marked as decorative',
      'button-name': 'Buttons should have an accessible name (visible text, aria-label, or aria-labelledby)',
      'link-name': 'Links should have an accessible name that describes the destination',
      'label': 'Form inputs should have associated labels',
      'aria-hidden-focus': 'Elements with aria-hidden="true" should not contain focusable elements',
      'duplicate-id': 'IDs should be unique within the page',
      'heading-order': 'Headings should be in logical order (h1 → h2 → h3)',
      'document-title': 'Page should have a descriptive title',
      'html-has-lang': 'HTML element should have a valid lang attribute',
      'bypass': 'Page should have a mechanism to bypass repeated blocks of content',
      'landmark-one-main': 'Page should have exactly one main landmark',
    };

    return expectations[ruleId] || 'Element should be accessible';
  }

  private getSuggestedFix(
    ruleId: string,
    node: { html: string }
  ): string {
    const fixes: Record<string, string> = {
      'color-contrast': 'Increase the contrast ratio by darkening the text color or lightening the background',
      'image-alt': 'Add alt="" for decorative images or a descriptive alt attribute for informative images',
      'button-name': 'Add visible text, aria-label, or aria-labelledby to the button',
      'link-name': 'Add descriptive text content to the link or use aria-label',
      'label': 'Add a <label> element with for="inputId" or wrap the input in a label element',
      'aria-hidden-focus': 'Remove focusable elements from aria-hidden containers or remove aria-hidden',
      'duplicate-id': 'Ensure each id attribute is unique within the page',
      'heading-order': 'Adjust heading levels to follow proper hierarchy',
      'document-title': 'Add a <title> element with descriptive content to the <head>',
      'html-has-lang': 'Add lang="en" (or appropriate language code) to the <html> element',
      'bypass': 'Add a skip link or proper landmark regions',
      'landmark-one-main': 'Wrap the main content in <main> or role="main"',
    };

    return fixes[ruleId] || 'Review the element and ensure it meets accessibility requirements';
  }

  private truncateHtml(html: string, maxLength = 500): string {
    if (html.length <= maxLength) return html;
    return html.substring(0, maxLength) + '...';
  }

  /**
   * Additional custom checks not covered by axe-core
   */
  private async runCustomChecks(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Check for focus visibility
    const focusFindings = await this.checkFocusVisibility(page, pageUrl, viewport);
    findings.push(...focusFindings);

    // Check for keyboard traps (basic detection)
    const trapFindings = await this.detectKeyboardTraps(page, pageUrl, viewport);
    findings.push(...trapFindings);

    return findings;
  }

  private async checkFocusVisibility(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const focusIssues = await page.evaluate(() => {
        const issues: Array<{ selector: string; html: string }> = [];
        const focusableElements = document.querySelectorAll(
          'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        focusableElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          const focusStyle = window.getComputedStyle(htmlEl, ':focus');
          
          // Check if element has no visible focus indicator
          // This is a heuristic - checking outline, border, box-shadow changes
          const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
          const hasFocusOutline = focusStyle.outlineStyle !== 'none';
          
          if (!hasOutline && !hasFocusOutline) {
            // Generate a reasonable selector
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className
              ? `.${el.className.toString().split(' ').filter(Boolean).join('.')}`
              : '';
            const tag = el.tagName.toLowerCase();
            
            issues.push({
              selector: id || `${tag}${classes}` || tag,
              html: el.outerHTML.substring(0, 200),
            });
          }
        });

        return issues.slice(0, 10); // Limit to avoid noise
      });

      for (const issue of focusIssues) {
        findings.push({
          id: this.evidenceCollector.generateFindingId(
            'focus-visible-check',
            issue.selector,
            pageUrl,
            viewport.name
          ),
          category: 'accessibility',
          severity: 'medium',
          confidence: 'likely',
          pageUrl,
          viewport: viewport.name,
          title: 'Focus indicator may not be visible',
          description:
            'This focusable element may not have a visible focus indicator. Users who navigate with keyboard need to see where focus is.',
          stepsToReproduce: [
            `Navigate to ${pageUrl}`,
            `Press Tab to focus on element: ${issue.selector}`,
            `Check if focus indicator is visible`,
          ],
          expected: 'Focusable elements should have a visible focus indicator',
          actual: 'No obvious focus outline or border detected',
          evidence: {
            selectors: [issue.selector],
            domSnippet: issue.html,
          },
          wcag: {
            version: this.options.wcagVersion,
            level: 'AA',
            successCriteria: ['2.4.7'],
          },
          suggestedFix:
            'Add a visible focus style using :focus or :focus-visible pseudo-class',
          references: [
            'https://www.w3.org/TR/WCAG21/#focus-visible',
          ],
        });
      }
    } catch {
      // Ignore errors in custom checks
    }

    return findings;
  }

  private async detectKeyboardTraps(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Simple keyboard trap detection - tab through and check for loops
      const focusOrder: string[] = [];
      const maxTabs = 50;

      for (let i = 0; i < maxTabs; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);

        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return 'body';
          return el.id ? `#${el.id}` : el.tagName.toLowerCase();
        });

        focusOrder.push(focused);

        // Check for potential trap (same element repeatedly)
        if (focusOrder.length >= 5) {
          const recent = focusOrder.slice(-5);
          const uniqueRecent = new Set(recent);
          if (uniqueRecent.size <= 2 && !recent.includes('body')) {
            // Possible trap detected
            findings.push({
              id: this.evidenceCollector.generateFindingId(
                'keyboard-trap',
                recent[0],
                pageUrl,
                viewport.name
              ),
              category: 'accessibility',
              severity: 'critical',
              confidence: 'likely',
              pageUrl,
              viewport: viewport.name,
              title: 'Potential keyboard trap detected',
              description:
                'Focus appears to be trapped in a small set of elements. Users navigating with keyboard may not be able to leave this area.',
              stepsToReproduce: [
                `Navigate to ${pageUrl}`,
                `Use Tab key to navigate through the page`,
                `Observe focus getting stuck around: ${[...uniqueRecent].join(', ')}`,
              ],
              expected: 'Users should be able to navigate away from any element using keyboard',
              actual: `Focus cycles through: ${recent.join(' → ')}`,
              evidence: {
                selectors: [...uniqueRecent],
              },
              wcag: {
                version: this.options.wcagVersion,
                level: 'A',
                successCriteria: ['2.1.2'],
              },
              suggestedFix:
                'Ensure all focusable areas have an exit path. Check modals and custom widgets for proper keyboard handling.',
              references: [
                'https://www.w3.org/TR/WCAG21/#no-keyboard-trap',
              ],
            });
            break;
          }
        }

        // Check if we've cycled back to start
        if (focused === 'body' && i > 5) break;
      }
    } catch {
      // Ignore errors
    }

    return findings;
  }
}
