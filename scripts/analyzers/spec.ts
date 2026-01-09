/**
 * Spec Analyzer - Custom UI Specification Validation Engine
 * Validates pages against team-defined design system rules
 */

import { Page } from 'playwright';
import * as fs from 'fs/promises';
import {
  Finding,
  ViewportConfig,
  AnalyzerResult,
  SpecRuleset,
  SpecRule,
  SpecRuleAssertion,
  Severity,
  Confidence,
} from '../types';
import { EvidenceCollector, calculateContrastRatio } from '../utils/evidence';

export class SpecAnalyzer {
  private ruleset: SpecRuleset | null = null;
  private evidenceCollector: EvidenceCollector;

  constructor(evidenceCollector: EvidenceCollector) {
    this.evidenceCollector = evidenceCollector;
  }

  /**
   * Load rules from file or object
   */
  async loadRules(rules: string | SpecRuleset): Promise<void> {
    if (typeof rules === 'string') {
      const content = await fs.readFile(rules, 'utf-8');
      this.ruleset = JSON.parse(content);
    } else {
      this.ruleset = rules;
    }
  }

  async analyze(
    page: Page,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<AnalyzerResult> {
    const findings: Finding[] = [];

    if (!this.ruleset) {
      return { findings };
    }

    for (const rule of this.ruleset.rules) {
      try {
        // Check if rule applies to this viewport
        if (rule.when?.viewport && rule.when.viewport !== viewport.name) {
          continue;
        }

        const ruleFindings = await this.evaluateRule(page, rule, pageUrl, viewport);
        findings.push(...ruleFindings);
      } catch (error) {
        console.error(`Error evaluating rule ${rule.id}:`, error);
      }
    }

    return { findings };
  }

  private async evaluateRule(
    page: Page,
    rule: SpecRule,
    pageUrl: string,
    viewport: ViewportConfig
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Find all matching elements
    const elements = await page.$$(rule.selector);

    for (const element of elements) {
      try {
        // Apply additional conditions if specified
        if (rule.when?.hasAttribute) {
          const hasAttr = await element.getAttribute(rule.when.hasAttribute);
          if (hasAttr === null) continue;
        }

        // Evaluate all assertions
        const failures = await this.evaluateAssertions(page, element, rule.assert);

        if (failures.length > 0) {
          // Get element details for the finding
          const selector = await this.getElementSelector(element);
          const html = await element.evaluate((el) => el.outerHTML.substring(0, 300));

          findings.push({
            id: this.evidenceCollector.generateFindingId(
              rule.id,
              selector,
              pageUrl,
              viewport.name
            ),
            category: 'spec',
            severity: rule.severity,
            confidence: 'certain' as Confidence,
            pageUrl,
            viewport: viewport.name,
            title: rule.message,
            description: `Element violates custom spec rule: ${rule.id}\n\nFailures:\n${failures.join('\n')}`,
            stepsToReproduce: [
              `Navigate to ${pageUrl}`,
              `Locate element: ${selector}`,
              `Check that element meets spec requirements`,
            ],
            expected: this.formatExpected(rule.assert),
            actual: failures.join('; '),
            evidence: {
              selectors: [selector],
              domSnippet: html,
            },
            ruleId: rule.id,
            suggestedFix: rule.suggestedFix || `Update element to comply with spec rule ${rule.id}`,
            references: rule.references,
          });
        }
      } catch (error) {
        // Element might have been removed from DOM
        continue;
      }
    }

    return findings;
  }

  private async evaluateAssertions(
    page: Page,
    element: import('playwright').ElementHandle,
    assertions: SpecRuleAssertion
  ): Promise<string[]> {
    const failures: string[] = [];

    // Check bounding box
    if (assertions.boundingBox) {
      const box = await element.boundingBox();
      if (box) {
        const { minWidthPx, minHeightPx, maxWidthPx, maxHeightPx } = assertions.boundingBox;
        
        if (minWidthPx && box.width < minWidthPx) {
          failures.push(`Width ${Math.round(box.width)}px < minimum ${minWidthPx}px`);
        }
        if (minHeightPx && box.height < minHeightPx) {
          failures.push(`Height ${Math.round(box.height)}px < minimum ${minHeightPx}px`);
        }
        if (maxWidthPx && box.width > maxWidthPx) {
          failures.push(`Width ${Math.round(box.width)}px > maximum ${maxWidthPx}px`);
        }
        if (maxHeightPx && box.height > maxHeightPx) {
          failures.push(`Height ${Math.round(box.height)}px > maximum ${maxHeightPx}px`);
        }
      }
    }

    // Check accessible name
    if (assertions.accessibleName) {
      const accessibleName = await this.getAccessibleName(element);
      const { minLength, pattern, required } = assertions.accessibleName;

      if (required && !accessibleName) {
        failures.push('Missing required accessible name');
      }
      if (minLength && (!accessibleName || accessibleName.length < minLength)) {
        failures.push(
          `Accessible name "${accessibleName || ''}" length < ${minLength} characters`
        );
      }
      if (pattern && accessibleName && !new RegExp(pattern).test(accessibleName)) {
        failures.push(`Accessible name "${accessibleName}" doesn't match pattern: ${pattern}`);
      }
    }

    // Check computed styles
    if (assertions.computedStyle) {
      const { property, in: allowedValues, notIn, matches, minValue, maxValue } =
        assertions.computedStyle;

      const styleValue = await element.evaluate(
        (node, prop) => window.getComputedStyle(node as Element).getPropertyValue(prop),
        property
      );

      if (allowedValues && !allowedValues.includes(styleValue)) {
        failures.push(`Style ${property}: "${styleValue}" not in allowed values`);
      }
      if (notIn && notIn.includes(styleValue)) {
        failures.push(`Style ${property}: "${styleValue}" is in forbidden values`);
      }
      if (matches && !new RegExp(matches).test(styleValue)) {
        failures.push(`Style ${property}: "${styleValue}" doesn't match pattern: ${matches}`);
      }
      if (minValue !== undefined || maxValue !== undefined) {
        const numericValue = parseFloat(styleValue);
        if (!isNaN(numericValue)) {
          if (minValue !== undefined && numericValue < minValue) {
            failures.push(`Style ${property}: ${numericValue} < minimum ${minValue}`);
          }
          if (maxValue !== undefined && numericValue > maxValue) {
            failures.push(`Style ${property}: ${numericValue} > maximum ${maxValue}`);
          }
        }
      }
    }

    // Check role
    if (assertions.role) {
      const role = await element.getAttribute('role');
      const { equals, in: allowedRoles } = assertions.role;

      if (equals && role !== equals) {
        failures.push(`Role "${role}" !== expected "${equals}"`);
      }
      if (allowedRoles && (!role || !allowedRoles.includes(role))) {
        failures.push(`Role "${role}" not in allowed roles: ${allowedRoles.join(', ')}`);
      }
    }

    // Check attribute
    if (assertions.attribute) {
      const { name, exists, value, pattern: attrPattern } = assertions.attribute;
      const attrValue = await element.getAttribute(name);

      if (exists === true && attrValue === null) {
        failures.push(`Missing required attribute: ${name}`);
      }
      if (exists === false && attrValue !== null) {
        failures.push(`Forbidden attribute present: ${name}`);
      }
      if (value !== undefined && attrValue !== value) {
        failures.push(`Attribute ${name}: "${attrValue}" !== expected "${value}"`);
      }
      if (attrPattern && attrValue && !new RegExp(attrPattern).test(attrValue)) {
        failures.push(`Attribute ${name}: "${attrValue}" doesn't match pattern: ${attrPattern}`);
      }
    }

    // Check focusable
    if (assertions.focusable !== undefined) {
      const isFocusable = await element.evaluate((node) => {
        const el = node as Element;
        const htmlEl = node as HTMLElement;
        const tabIndex = htmlEl.tabIndex;
        const isNativelyFocusable = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(
          el.tagName
        );
        return tabIndex >= 0 || (isNativelyFocusable && tabIndex !== -1);
      });

      if (assertions.focusable && !isFocusable) {
        failures.push('Element should be focusable but is not');
      }
      if (!assertions.focusable && isFocusable) {
        failures.push('Element should not be focusable but is');
      }
    }

    // Check visibility
    if (assertions.visible !== undefined) {
      const isVisible = await element.isVisible();
      if (assertions.visible && !isVisible) {
        failures.push('Element should be visible but is hidden');
      }
      if (!assertions.visible && isVisible) {
        failures.push('Element should be hidden but is visible');
      }
    }

    return failures;
  }

  private async getAccessibleName(
    element: import('playwright').ElementHandle
  ): Promise<string | null> {
    return await element.evaluate((node) => {
      const el = node as Element;
      // Check aria-label
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // Check aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || null;
      }

      // Check for associated label
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent?.trim() || null;
      }

      // Check for wrapped label
      const parentLabel = el.closest('label');
      if (parentLabel) {
        return parentLabel.textContent?.trim() || null;
      }

      // Check title
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

      return null;
    });
  }

  private async getElementSelector(
    element: import('playwright').ElementHandle
  ): Promise<string> {
    return await element.evaluate((node) => {
      const el = node as Element;
      if (el.id) return `#${el.id}`;

      const classes = el.className
        ? `.${el.className.toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`
        : '';
      const tag = el.tagName.toLowerCase();

      return `${tag}${classes}` || tag;
    });
  }

  private formatExpected(assertions: SpecRuleAssertion): string {
    const expected: string[] = [];

    if (assertions.boundingBox) {
      const { minWidthPx, minHeightPx, maxWidthPx, maxHeightPx } = assertions.boundingBox;
      if (minWidthPx) expected.push(`min-width: ${minWidthPx}px`);
      if (minHeightPx) expected.push(`min-height: ${minHeightPx}px`);
      if (maxWidthPx) expected.push(`max-width: ${maxWidthPx}px`);
      if (maxHeightPx) expected.push(`max-height: ${maxHeightPx}px`);
    }

    if (assertions.accessibleName) {
      if (assertions.accessibleName.required) expected.push('accessible name required');
      if (assertions.accessibleName.minLength) {
        expected.push(`accessible name >= ${assertions.accessibleName.minLength} chars`);
      }
    }

    if (assertions.computedStyle) {
      expected.push(`${assertions.computedStyle.property} matches spec`);
    }

    if (assertions.role) {
      if (assertions.role.equals) expected.push(`role="${assertions.role.equals}"`);
    }

    if (assertions.attribute) {
      expected.push(`attribute ${assertions.attribute.name} meets requirements`);
    }

    return expected.join(', ') || 'Element meets spec requirements';
  }

  /**
   * Validate a ruleset for syntax errors
   */
  static validateRuleset(ruleset: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!ruleset || typeof ruleset !== 'object') {
      return { valid: false, errors: ['Ruleset must be an object'] };
    }

    const rs = ruleset as Record<string, unknown>;

    if (!rs.version || typeof rs.version !== 'string') {
      errors.push('Ruleset must have a version string');
    }

    if (!Array.isArray(rs.rules)) {
      errors.push('Ruleset must have a rules array');
      return { valid: false, errors };
    }

    for (let i = 0; i < rs.rules.length; i++) {
      const rule = rs.rules[i] as Record<string, unknown>;
      
      if (!rule.id || typeof rule.id !== 'string') {
        errors.push(`Rule ${i}: missing or invalid id`);
      }
      if (!rule.selector || typeof rule.selector !== 'string') {
        errors.push(`Rule ${i}: missing or invalid selector`);
      }
      if (!rule.assert || typeof rule.assert !== 'object') {
        errors.push(`Rule ${i}: missing or invalid assert object`);
      }
      if (!rule.severity || !['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity as string)) {
        errors.push(`Rule ${i}: invalid severity`);
      }
      if (!rule.message || typeof rule.message !== 'string') {
        errors.push(`Rule ${i}: missing or invalid message`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Create a default ruleset with common best practices
 */
export function createDefaultRuleset(): SpecRuleset {
  return {
    version: '1.0',
    rules: [
      {
        id: 'icon-button-accessible-name',
        type: 'accessibility-spec',
        selector: 'button:not(:has(span:not(.sr-only))):not(:has(text))',
        assert: {
          accessibleName: { minLength: 1 },
        },
        severity: 'high',
        message: 'Icon-only buttons must have an accessible name (aria-label or aria-labelledby)',
        suggestedFix: 'Add aria-label attribute with descriptive text',
        references: ['https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html'],
      },
      {
        id: 'min-tap-target-mobile',
        type: 'usability-spec',
        selector: 'button, a, input, select, [role="button"]',
        when: { viewport: 'mobile' },
        assert: {
          boundingBox: { minWidthPx: 44, minHeightPx: 44 },
        },
        severity: 'medium',
        message: 'Interactive controls must be at least 44x44 px on mobile',
        suggestedFix: 'Increase element size using min-width, min-height, or padding',
        references: ['https://www.w3.org/WAI/WCAG21/Understanding/target-size.html'],
      },
      {
        id: 'link-has-href',
        type: 'accessibility-spec',
        selector: 'a',
        assert: {
          attribute: { name: 'href', exists: true },
        },
        severity: 'medium',
        message: 'Links should have an href attribute',
        suggestedFix: 'Add href attribute or convert to button if it triggers an action',
      },
      {
        id: 'img-has-alt',
        type: 'accessibility-spec',
        selector: 'img',
        assert: {
          attribute: { name: 'alt', exists: true },
        },
        severity: 'high',
        message: 'Images must have alt attribute (can be empty for decorative images)',
        suggestedFix: 'Add alt="" for decorative images or descriptive alt text for informative images',
        references: ['https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html'],
      },
    ],
  };
}
