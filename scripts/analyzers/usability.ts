/**
 * Usability Analyzer
 * Heuristic and interaction-based usability checks
 */

import { Page } from 'playwright';
import {
  Finding,
  ViewportConfig,
  AnalyzerResult,
  Severity,
} from '../types';
import { EvidenceCollector } from '../utils/evidence';

export interface UsabilityAnalyzerOptions {
  minTapTargetSize: number; // Default 44px for mobile
  checkOverlaps: boolean;
  checkClippedText: boolean;
  checkFocusTraps: boolean;
  checkModals: boolean;
  checkStickyHeaders: boolean;
}

export class UsabilityAnalyzer {
  private options: UsabilityAnalyzerOptions;
  private evidenceCollector: EvidenceCollector;

  constructor(
    evidenceCollector: EvidenceCollector,
    options: Partial<UsabilityAnalyzerOptions> = {}
  ) {
    this.options = {
      minTapTargetSize: 44,
      checkOverlaps: true,
      checkClippedText: true,
      checkFocusTraps: true,
      checkModals: true,
      checkStickyHeaders: true,
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
      // Check tap target sizes (especially important for mobile)
      if (viewport.name === 'mobile' || viewport.name === 'tablet') {
        const tapTargetFindings = await this.checkTapTargetSizes(page, pageUrl, viewport);
        findings.push(...tapTargetFindings);
      }

      // Check for overlapping elements
      if (this.options.checkOverlaps) {
        const overlapFindings = await this.checkOverlappingElements(page, pageUrl, viewport);
        findings.push(...overlapFindings);
      }

      // Check for clipped/truncated text
      if (this.options.checkClippedText) {
        const clippedFindings = await this.checkClippedText(page, pageUrl, viewport);
        findings.push(...clippedFindings);
      }

      // Check sticky headers covering anchor targets
      if (this.options.checkStickyHeaders) {
        const stickyFindings = await this.checkStickyHeaders(page, pageUrl, viewport);
        findings.push(...stickyFindings);
      }

      // Check modal behavior
      if (this.options.checkModals) {
        const modalFindings = await this.checkModals(page, pageUrl, viewport);
        findings.push(...modalFindings);
      }

      // Check for horizontal scroll on mobile
      if (viewport.name === 'mobile') {
        const scrollFindings = await this.checkHorizontalScroll(page, pageUrl, viewport);
        findings.push(...scrollFindings);
      }

    } catch (error) {
      console.error('Usability analysis error:', error);
    }

    return { findings };
  }

  private async checkTapTargetSizes(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];
    const minSize = this.options.minTapTargetSize;

    const smallTargets = await page.evaluate((minSize) => {
      const interactiveSelectors = [
        'a',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])',
      ];

      const issues: Array<{
        selector: string;
        html: string;
        width: number;
        height: number;
      }> = [];

      const elements = document.querySelectorAll(interactiveSelectors.join(', '));

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        
        // Skip hidden elements
        if (rect.width === 0 || rect.height === 0) return;
        
        // Skip elements off-screen
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        if (rect.left > window.innerWidth || rect.right < 0) return;

        if (rect.width < minSize || rect.height < minSize) {
          const id = el.id ? `#${el.id}` : '';
          const classes = el.className
            ? `.${el.className.toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`
            : '';
          const tag = el.tagName.toLowerCase();

          issues.push({
            selector: id || `${tag}${classes}` || tag,
            html: el.outerHTML.substring(0, 200),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });

      return issues.slice(0, 20); // Limit to avoid noise
    }, minSize);

    for (const target of smallTargets) {
      findings.push({
        id: this.evidenceCollector.generateFindingId(
          'small-tap-target',
          target.selector,
          pageUrl,
          viewport.name
        ),
        category: 'usability',
        severity: 'medium',
        confidence: 'certain',
        pageUrl,
        viewport: viewport.name,
        title: `Tap target too small: ${target.width}x${target.height}px`,
        description: `Interactive element is smaller than the recommended ${minSize}x${minSize}px minimum. This can make it difficult for users to tap on mobile devices.`,
        stepsToReproduce: [
          `Navigate to ${pageUrl} on a mobile device`,
          `Locate element: ${target.selector}`,
          `Attempt to tap the element`,
        ],
        expected: `Interactive elements should be at least ${minSize}x${minSize}px on mobile`,
        actual: `Element size is ${target.width}x${target.height}px`,
        evidence: {
          selectors: [target.selector],
          domSnippet: target.html,
        },
        suggestedFix: `Increase the element's size to at least ${minSize}x${minSize}px using min-width, min-height, or padding`,
        references: [
          'https://www.w3.org/WAI/WCAG21/Understanding/target-size.html',
        ],
      });
    }

    return findings;
  }

  private async checkOverlappingElements(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const overlaps = await page.evaluate(() => {
      const issues: Array<{
        selector1: string;
        selector2: string;
        html1: string;
        html2: string;
      }> = [];

      // Check interactive elements for overlaps
      const interactive = document.querySelectorAll(
        'a, button, input, select, [role="button"], [role="link"]'
      );

      const rects: Array<{ el: Element; rect: DOMRect; selector: string }> = [];

      interactive.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const id = el.id ? `#${el.id}` : '';
          const tag = el.tagName.toLowerCase();
          rects.push({
            el,
            rect,
            selector: id || tag,
          });
        }
      });

      // Check for overlaps
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].rect;
          const b = rects[j].rect;

          // Check if rectangles overlap significantly (more than 10%)
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smallerArea = Math.min(a.width * a.height, b.width * b.height);

          if (overlapArea > smallerArea * 0.1 && overlapArea > 100) {
            issues.push({
              selector1: rects[i].selector,
              selector2: rects[j].selector,
              html1: rects[i].el.outerHTML.substring(0, 150),
              html2: rects[j].el.outerHTML.substring(0, 150),
            });

            if (issues.length >= 5) return issues;
          }
        }
      }

      return issues;
    });

    for (const overlap of overlaps) {
      findings.push({
        id: this.evidenceCollector.generateFindingId(
          'overlapping-elements',
          `${overlap.selector1}+${overlap.selector2}`,
          pageUrl,
          viewport.name
        ),
        category: 'usability',
        severity: 'high',
        confidence: 'certain',
        pageUrl,
        viewport: viewport.name,
        title: 'Overlapping interactive elements detected',
        description:
          'Two interactive elements are overlapping, which may cause users to accidentally click the wrong element.',
        stepsToReproduce: [
          `Navigate to ${pageUrl}`,
          `Locate elements: ${overlap.selector1} and ${overlap.selector2}`,
          `Observe that elements overlap`,
        ],
        expected: 'Interactive elements should not overlap',
        actual: 'Elements overlap significantly',
        evidence: {
          selectors: [overlap.selector1, overlap.selector2],
          domSnippet: `Element 1: ${overlap.html1}\n\nElement 2: ${overlap.html2}`,
        },
        suggestedFix:
          'Adjust positioning or z-index to prevent overlap. Consider using CSS Grid or Flexbox for better layout control.',
      });
    }

    return findings;
  }

  private async checkClippedText(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const clippedElements = await page.evaluate(() => {
      const issues: Array<{
        selector: string;
        html: string;
        clipType: 'horizontal' | 'vertical';
      }> = [];

      const textElements = document.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button'
      );

      textElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        
        // Skip empty elements
        if (!htmlEl.textContent?.trim()) return;

        const style = window.getComputedStyle(htmlEl);
        
        // Check for horizontal overflow
        if (htmlEl.scrollWidth > htmlEl.clientWidth + 5) {
          // Check if overflow is hidden
          if (style.overflowX === 'hidden' || style.textOverflow === 'ellipsis') {
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className
              ? `.${el.className.toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`
              : '';
            const tag = el.tagName.toLowerCase();

            issues.push({
              selector: id || `${tag}${classes}` || tag,
              html: el.outerHTML.substring(0, 200),
              clipType: 'horizontal',
            });
          }
        }

        // Check for vertical overflow
        if (htmlEl.scrollHeight > htmlEl.clientHeight + 5) {
          if (style.overflowY === 'hidden') {
            const id = el.id ? `#${el.id}` : '';
            const tag = el.tagName.toLowerCase();

            issues.push({
              selector: id || tag,
              html: el.outerHTML.substring(0, 200),
              clipType: 'vertical',
            });
          }
        }
      });

      return issues.slice(0, 10);
    });

    for (const clipped of clippedElements) {
      findings.push({
        id: this.evidenceCollector.generateFindingId(
          'clipped-text',
          clipped.selector,
          pageUrl,
          viewport.name
        ),
        category: 'usability',
        severity: 'medium',
        confidence: 'likely',
        pageUrl,
        viewport: viewport.name,
        title: `Text content is ${clipped.clipType}ly clipped`,
        description:
          'Text content extends beyond its container and is being clipped. Users may not be able to read all the content.',
        stepsToReproduce: [
          `Navigate to ${pageUrl}`,
          `Locate element: ${clipped.selector}`,
          `Observe that text is cut off`,
        ],
        expected: 'All text content should be readable without clipping',
        actual: `Text is ${clipped.clipType}ly clipped by overflow hidden`,
        evidence: {
          selectors: [clipped.selector],
          domSnippet: clipped.html,
        },
        suggestedFix:
          'Ensure container is large enough for content, or use text-overflow: ellipsis with a tooltip for full text',
      });
    }

    return findings;
  }

  private async checkStickyHeaders(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Check if there are sticky/fixed headers
    const stickyElements = await page.evaluate(() => {
      const fixed = document.querySelectorAll('*');
      const stickyHeaders: Array<{ selector: string; height: number }> = [];

      fixed.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (
          (style.position === 'fixed' || style.position === 'sticky') &&
          el.getBoundingClientRect().top <= 100
        ) {
          const rect = el.getBoundingClientRect();
          if (rect.height > 30) {
            // Only consider substantial elements
            stickyHeaders.push({
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
              height: rect.height,
            });
          }
        }
      });

      return stickyHeaders;
    });

    // If there are sticky headers, check if anchors are obscured
    if (stickyElements.length > 0) {
      const totalStickyHeight = stickyElements.reduce((sum, el) => sum + el.height, 0);

      // Check for anchors that might be obscured
      const hasAnchorIssue = await page.evaluate((stickyHeight) => {
        const anchors = document.querySelectorAll('[id]');
        let hasIssue = false;

        anchors.forEach((anchor) => {
          const rect = anchor.getBoundingClientRect();
          // Check if anchor target would be under sticky header
          if (rect.top > 0 && rect.top < stickyHeight) {
            hasIssue = true;
          }
        });

        // Also check if scroll-padding-top is set
        const html = document.documentElement;
        const scrollPadding = window.getComputedStyle(html).scrollPaddingTop;
        if (scrollPadding === 'auto' || parseInt(scrollPadding) < stickyHeight) {
          hasIssue = true;
        }

        return hasIssue;
      }, totalStickyHeight);

      if (hasAnchorIssue) {
        findings.push({
          id: this.evidenceCollector.generateFindingId(
            'sticky-header-anchor',
            'html',
            pageUrl,
            viewport.name
          ),
          category: 'usability',
          severity: 'low',
          confidence: 'likely',
          pageUrl,
          viewport: viewport.name,
          title: 'Sticky header may obscure anchor targets',
          description: `Page has sticky/fixed headers totaling ${totalStickyHeight}px height that may cover content when navigating to anchors.`,
          stepsToReproduce: [
            `Navigate to ${pageUrl}`,
            `Click on an anchor link (e.g., table of contents)`,
            `Observe if the target content is covered by the sticky header`,
          ],
          expected: 'Anchor navigation should account for sticky header height',
          actual: 'Scroll-padding-top may not account for sticky header',
          evidence: {
            selectors: stickyElements.map((e) => e.selector),
          },
          suggestedFix: `Add scroll-padding-top: ${totalStickyHeight + 16}px to the html element or use scroll-margin-top on anchor targets`,
        });
      }
    }

    return findings;
  }

  private async checkModals(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Look for common modal patterns
    const modalIssues = await page.evaluate(() => {
      const issues: Array<{
        type: string;
        selector: string;
        html: string;
      }> = [];

      // Find potential modals
      const modalSelectors = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        '.modal',
        '.dialog',
        '[class*="modal"]',
        '[class*="dialog"]',
        '[class*="popup"]',
        '[class*="overlay"]',
      ];

      const modals = document.querySelectorAll(modalSelectors.join(', '));

      modals.forEach((modal) => {
        const htmlEl = modal as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        
        // Skip hidden modals
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const selector = modal.id
          ? `#${modal.id}`
          : modal.className
          ? `.${modal.className.toString().split(' ')[0]}`
          : 'dialog';

        // Check for missing aria-modal
        if (
          modal.getAttribute('role') === 'dialog' &&
          modal.getAttribute('aria-modal') !== 'true'
        ) {
          issues.push({
            type: 'missing-aria-modal',
            selector,
            html: modal.outerHTML.substring(0, 200),
          });
        }

        // Check if body scroll is locked
        const bodyStyle = window.getComputedStyle(document.body);
        if (bodyStyle.overflow !== 'hidden') {
          issues.push({
            type: 'scroll-not-locked',
            selector,
            html: modal.outerHTML.substring(0, 200),
          });
        }

        // Check for close button
        const hasCloseButton = modal.querySelector(
          '[aria-label*="close"], [aria-label*="Close"], .close, .modal-close, button[class*="close"]'
        );
        if (!hasCloseButton) {
          issues.push({
            type: 'no-close-button',
            selector,
            html: modal.outerHTML.substring(0, 200),
          });
        }
      });

      return issues.slice(0, 5);
    });

    for (const issue of modalIssues) {
      const severityMap: Record<string, Severity> = {
        'missing-aria-modal': 'medium',
        'scroll-not-locked': 'low',
        'no-close-button': 'high',
      };

      const titleMap: Record<string, string> = {
        'missing-aria-modal': 'Modal missing aria-modal="true"',
        'scroll-not-locked': 'Background scroll not locked when modal open',
        'no-close-button': 'Modal has no visible close button',
      };

      const descriptionMap: Record<string, string> = {
        'missing-aria-modal':
          'Dialog element with role="dialog" should have aria-modal="true" to properly trap focus.',
        'scroll-not-locked':
          'When a modal is open, background content should not be scrollable.',
        'no-close-button':
          'Users should be able to dismiss the modal with a clearly visible close button.',
      };

      findings.push({
        id: this.evidenceCollector.generateFindingId(
          `modal-${issue.type}`,
          issue.selector,
          pageUrl,
          viewport.name
        ),
        category: 'usability',
        severity: severityMap[issue.type] || 'medium',
        confidence: 'likely',
        pageUrl,
        viewport: viewport.name,
        title: titleMap[issue.type] || 'Modal usability issue',
        description: descriptionMap[issue.type] || 'Modal may have usability issues.',
        stepsToReproduce: [
          `Navigate to ${pageUrl}`,
          `Open the modal: ${issue.selector}`,
          `Check for the issue`,
        ],
        expected: 'Modals should be accessible and dismissible',
        actual: `Issue: ${issue.type}`,
        evidence: {
          selectors: [issue.selector],
          domSnippet: issue.html,
        },
        suggestedFix: this.getModalFix(issue.type),
      });
    }

    return findings;
  }

  private getModalFix(issueType: string): string {
    const fixes: Record<string, string> = {
      'missing-aria-modal':
        'Add aria-modal="true" to the dialog element to properly announce to screen readers',
      'scroll-not-locked':
        'Add overflow: hidden to body when modal opens, restore on close',
      'no-close-button':
        'Add a visible close button with aria-label="Close" in the top-right corner',
    };
    return fixes[issueType] || 'Review modal implementation for accessibility best practices';
  }

  private async checkHorizontalScroll(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalScroll) {
      // Find the offending elements
      const overflowingElements = await page.evaluate((viewportWidth) => {
        const issues: string[] = [];
        const allElements = document.querySelectorAll('*');

        allElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewportWidth && rect.width > 20) {
            const selector = el.id
              ? `#${el.id}`
              : el.className
              ? `.${el.className.toString().split(' ')[0]}`
              : el.tagName.toLowerCase();
            if (!issues.includes(selector)) {
              issues.push(selector);
            }
          }
        });

        return issues.slice(0, 5);
      }, viewport.width);

      findings.push({
        id: this.evidenceCollector.generateFindingId(
          'horizontal-scroll',
          'body',
          pageUrl,
          viewport.name
        ),
        category: 'usability',
        severity: 'high',
        confidence: 'certain',
        pageUrl,
        viewport: viewport.name,
        title: 'Page has horizontal scroll on mobile',
        description:
          'The page content extends beyond the viewport width, causing horizontal scrolling on mobile devices.',
        stepsToReproduce: [
          `Navigate to ${pageUrl} on a mobile device`,
          `Observe horizontal scrollbar or try to scroll horizontally`,
        ],
        expected: 'Page should fit within viewport without horizontal scroll',
        actual: 'Page has horizontal overflow',
        evidence: {
          selectors: overflowingElements,
        },
        suggestedFix:
          'Check the listed elements for fixed widths, ensure images have max-width: 100%, and use overflow-x: hidden cautiously',
      });
    }

    return findings;
  }
}
