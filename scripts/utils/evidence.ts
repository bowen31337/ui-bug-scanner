/**
 * Evidence Capture Utilities
 * Handles screenshots, DOM snapshots, and other evidence collection
 */

import { Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface EvidenceCapture {
  screenshotPath?: string;
  domSnippet?: string;
  fullPageScreenshotPath?: string;
  accessibilityTree?: string;
  computedStyles?: Record<string, string>;
}

export class EvidenceCollector {
  private outputDir: string;
  private screenshotIndex = 0;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  async init(): Promise<void> {
    const screenshotsDir = path.join(this.outputDir, 'screenshots');
    await fs.mkdir(screenshotsDir, { recursive: true });
  }

  async captureFullPage(
    page: Page,
    pageUrl: string,
    viewport: string
  ): Promise<string> {
    const filename = this.generateFilename('page', pageUrl, viewport, 'png');
    const filepath = path.join(this.outputDir, 'screenshots', filename);
    
    await page.screenshot({ path: filepath, fullPage: true });
    return `screenshots/${filename}`;
  }

  async captureElement(
    page: Page,
    selector: string,
    pageUrl: string,
    viewport: string,
    ruleId: string
  ): Promise<string | undefined> {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        const filename = this.generateFilename(ruleId, pageUrl, viewport, 'png');
        const filepath = path.join(this.outputDir, 'screenshots', filename);
        
        // Scroll element into view first
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        
        await element.screenshot({ path: filepath });
        return `screenshots/${filename}`;
      }
    } catch {
      // Element might not exist or not be visible
    }
    return undefined;
  }

  async captureDomSnippet(page: Page, selector: string): Promise<string | undefined> {
    try {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return undefined;
        
        // Get outer HTML with some context
        const html = el.outerHTML;
        
        // Truncate if too long
        if (html.length > 1000) {
          return html.substring(0, 1000) + '...';
        }
        return html;
      }, selector);
    } catch {
      return undefined;
    }
  }

  async captureAccessibilityTree(page: Page): Promise<string | undefined> {
    try {
      const tree = await (page as any).accessibility?.snapshot?.();
      return tree ? JSON.stringify(tree, null, 2) : undefined;
    } catch {
      return undefined;
    }
  }

  async captureComputedStyles(
    page: Page,
    selector: string,
    properties: string[]
  ): Promise<Record<string, string> | undefined> {
    try {
      return await page.evaluate(
        ({ sel, props }) => {
          const el = document.querySelector(sel);
          if (!el) return undefined;
          
          const styles = window.getComputedStyle(el);
          const result: Record<string, string> = {};
          props.forEach((prop) => {
            result[prop] = styles.getPropertyValue(prop);
          });
          return result;
        },
        { sel: selector, props: properties }
      );
    } catch {
      return undefined;
    }
  }

  private generateFilename(
    prefix: string,
    url: string,
    viewport: string,
    extension: string
  ): string {
    this.screenshotIndex++;
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    const sanitizedPrefix = prefix.replace(/[^a-z0-9-]/gi, '-').substring(0, 30);
    return `${String(this.screenshotIndex).padStart(4, '0')}-${sanitizedPrefix}-${viewport}-${urlHash}.${extension}`;
  }

  generateFindingId(
    ruleId: string,
    selector: string,
    pageUrl: string,
    viewport: string
  ): string {
    const hash = crypto
      .createHash('md5')
      .update(`${ruleId}|${selector}|${pageUrl}|${viewport}`)
      .digest('hex')
      .substring(0, 12);
    
    return `${ruleId}|${this.normalizeSelector(selector)}|${viewport}|${hash}`;
  }

  private normalizeSelector(selector: string): string {
    // Normalize selectors for deduplication
    // Remove dynamic IDs, nth-child variations, etc.
    return selector
      .replace(/:nth-child\(\d+\)/g, '')
      .replace(/:nth-of-type\(\d+\)/g, '')
      .replace(/#[a-zA-Z0-9_-]*\d+[a-zA-Z0-9_-]*/g, '[id]') // Remove IDs with numbers
      .trim();
  }
}

/**
 * Mask sensitive data in screenshots (PII protection)
 */
export async function maskSensitiveFields(
  page: Page,
  selectors: string[] = ['input[type="password"]', 'input[type="email"]', 'input[name*="ssn"]']
): Promise<void> {
  await page.evaluate((sels) => {
    sels.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.backgroundColor = '#000';
        htmlEl.style.color = '#000';
        if (el instanceof HTMLInputElement) {
          el.value = '••••••••';
        }
      });
    });
  }, selectors);
}

/**
 * Calculate color contrast ratio between two colors
 */
export function calculateContrastRatio(fg: string, bg: string): number {
  const fgLuminance = getRelativeLuminance(parseColor(fg));
  const bgLuminance = getRelativeLuminance(parseColor(bg));
  
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(color: string): { r: number; g: number; b: number } {
  // Handle rgb/rgba format
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  
  // Handle hex format
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  
  // Default to black if parsing fails
  return { r: 0, g: 0, b: 0 };
}

function getRelativeLuminance(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  
  const sRGB = [r / 255, g / 255, b / 255];
  const linear = sRGB.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
