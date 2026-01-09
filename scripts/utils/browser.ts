/**
 * Browser Runner - Playwright wrapper for deterministic navigation and evidence capture
 */

import { chromium, Browser, Page, BrowserContext as PlaywrightContext } from 'playwright';
import {
  ViewportConfig,
  AuthConfig,
  LoginStep,
  InteractionStep,
  BrowserContext,
} from '../types';

export interface BrowserRunnerOptions {
  headless?: boolean;
  timeout?: number;
  slowMo?: number;
}

export class BrowserRunner {
  private browser: Browser | null = null;
  private options: BrowserRunnerOptions;

  constructor(options: BrowserRunnerOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      slowMo: 0,
      ...options,
    };
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    
    this.browser = await chromium.launch({
      headless: this.options.headless,
      slowMo: this.options.slowMo,
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async createContext(
    viewport: ViewportConfig,
    locale?: string,
    auth?: AuthConfig
  ): Promise<{ context: PlaywrightContext; page: Page }> {
    if (!this.browser) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const context = await this.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: locale || 'en-US',
      deviceScaleFactor: 1,
      isMobile: viewport.name === 'mobile',
      hasTouch: viewport.name === 'mobile' || viewport.name === 'tablet',
    });

    // Apply auth cookies if provided
    if (auth?.cookies) {
      await context.addCookies(
        auth.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly ?? false,
        }))
      );
    }

    const page = await context.newPage();
    page.setDefaultTimeout(this.options.timeout!);

    // Apply auth headers if provided
    if (auth?.headers) {
      await page.setExtraHTTPHeaders(auth.headers);
    }

    return { context, page };
  }

  async executeLoginSteps(page: Page, steps: LoginStep[]): Promise<void> {
    for (const step of steps) {
      switch (step.action) {
        case 'navigate':
          if (step.url) {
            await page.goto(step.url, { waitUntil: 'networkidle' });
          }
          break;

        case 'type':
          if (step.selector && step.value) {
            // Replace environment variable placeholders
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
          await page.waitForLoadState('networkidle', {
            timeout: step.timeout || this.options.timeout,
          });
          break;

        case 'waitForSelector':
          if (step.selector) {
            await page.waitForSelector(step.selector, {
              timeout: step.timeout || this.options.timeout,
            });
          }
          break;
      }
    }
  }

  async navigateTo(page: Page, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Additional stability check - wait for no layout shifts
    await this.waitForDomStable(page);
  }

  async waitForDomStable(page: Page, timeout = 3000, interval = 100): Promise<void> {
    const start = Date.now();
    let lastHtml = '';
    
    while (Date.now() - start < timeout) {
      const currentHtml = await page.content();
      if (currentHtml === lastHtml) {
        return;
      }
      lastHtml = currentHtml;
      await page.waitForTimeout(interval);
    }
  }

  async executeInteractions(page: Page, steps: InteractionStep[]): Promise<void> {
    for (const step of steps) {
      switch (step.action) {
        case 'click':
          if (step.selector) {
            await page.click(step.selector);
            await page.waitForTimeout(300); // Allow UI to settle
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
  }

  async captureScreenshot(page: Page, path: string, fullPage = true): Promise<void> {
    await page.screenshot({ path, fullPage });
  }

  async captureElementScreenshot(
    page: Page,
    selector: string,
    path: string
  ): Promise<boolean> {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        await element.screenshot({ path });
        return true;
      }
    } catch {
      // Element not found or not visible
    }
    return false;
  }

  async getDomSnapshot(page: Page): Promise<string> {
    return await page.content();
  }

  async getDomSnippet(page: Page, selector: string): Promise<string | null> {
    try {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.outerHTML : null;
      }, selector);
    } catch {
      return null;
    }
  }

  async getAccessibilityTree(page: Page): Promise<string> {
    // Note: accessibility.snapshot() is available in Playwright
    const snapshot = await (page as any).accessibility?.snapshot?.() || {};
    return JSON.stringify(snapshot, null, 2);
  }

  async getFocusableElements(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ];

      const elements = document.querySelectorAll(focusableSelectors.join(', '));
      const selectors: string[] = [];

      elements.forEach((el, idx) => {
        // Generate a unique selector for each focusable element
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className
          ? `.${el.className.toString().split(' ').filter(Boolean).join('.')}`
          : '';
        const tag = el.tagName.toLowerCase();
        selectors.push(id || `${tag}${classes}` || `${tag}:nth-of-type(${idx + 1})`);
      });

      return selectors;
    });
  }

  async tabThroughPage(page: Page, maxTabs = 100): Promise<{
    focusOrder: string[];
    trapped: boolean;
    trapSelector?: string;
  }> {
    const focusOrder: string[] = [];
    const visited = new Set<string>();
    let trapped = false;
    let trapSelector: string | undefined;

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);

      const focusedSelector = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className
          ? `.${el.className.toString().split(' ').filter(Boolean).join('.')}`
          : '';
        const tag = el.tagName.toLowerCase();
        return id || `${tag}${classes}` || tag;
      });

      // Check for focus trap (same element focused multiple times in a row)
      if (visited.has(focusedSelector)) {
        const recentFocus = focusOrder.slice(-3);
        if (recentFocus.every((s) => s === focusedSelector)) {
          trapped = true;
          trapSelector = focusedSelector;
          break;
        }
      }

      visited.add(focusedSelector);
      focusOrder.push(focusedSelector);

      // Check if we've cycled back to the beginning
      if (focusedSelector === 'body' || focusedSelector === focusOrder[0]) {
        break;
      }
    }

    return { focusOrder, trapped, trapSelector };
  }

  async getBoundingBox(
    page: Page,
    selector: string
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const element = page.locator(selector).first();
      return await element.boundingBox();
    } catch {
      return null;
    }
  }

  async getComputedStyles(
    page: Page,
    selector: string,
    properties: string[]
  ): Promise<Record<string, string>> {
    return await page.evaluate(
      ({ sel, props }) => {
        const el = document.querySelector(sel);
        if (!el) return {};
        
        const styles = window.getComputedStyle(el);
        const result: Record<string, string> = {};
        props.forEach((prop) => {
          result[prop] = styles.getPropertyValue(prop);
        });
        return result;
      },
      { sel: selector, props: properties }
    );
  }

  async getAccessibleName(page: Page, selector: string): Promise<string | null> {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;

      // Check aria-label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // Check aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || null;
      }

      // Check for associated label (for form elements)
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent?.trim() || null;
      }

      // Check for wrapped label
      const parentLabel = el.closest('label');
      if (parentLabel) {
        return parentLabel.textContent?.trim() || null;
      }

      // Check title attribute
      const title = el.getAttribute('title');
      if (title) return title;

      // Check text content for buttons/links
      if (el.tagName === 'BUTTON' || el.tagName === 'A') {
        return el.textContent?.trim() || null;
      }

      // Check alt for images
      if (el.tagName === 'IMG') {
        return el.getAttribute('alt');
      }

      // Check value for inputs
      if (el.tagName === 'INPUT') {
        const input = el as HTMLInputElement;
        if (input.type === 'submit' || input.type === 'button') {
          return input.value || null;
        }
      }

      return null;
    }, selector);
  }
}

export const browserRunner = new BrowserRunner();
