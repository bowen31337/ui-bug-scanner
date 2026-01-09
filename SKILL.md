---
name: ui-bug-scanner
description: Scans websites for UI bugs including accessibility issues (WCAG 2.x AA), usability problems, and custom UI spec violations. Use when you need to audit a website for accessibility compliance, find usability issues, validate against design system rules, or generate developer-ready bug reports. Supports crawling, authenticated apps, and CI integration.
compatibility: Requires Node.js 18+, Playwright, and network access. Works with Chromium-based headless browser.
allowed-tools: run_terminal_cmd read_file write list_dir
---

# UI Bug Scanner

A comprehensive website UI bug scanning skill that detects accessibility issues, usability problems, and custom UI specification violations.

## When to Use This Skill

- Audit a website for **WCAG 2.x Level AA accessibility compliance**
- Find **usability issues** like small tap targets, focus traps, or overlapping elements
- Validate against **custom UI specifications** (design system rules, component contracts)
- Generate **developer-ready bug reports** with evidence (screenshots, DOM snippets, reproduction steps)
- Run **CI/CD accessibility gates** that fail builds on critical issues

## Quick Start

### 1. Single URL Scan

```bash
cd ui-bug-scanner/scripts
npx ts-node scanner.ts --url "https://example.com" --viewport desktop,mobile
```

### 2. Sitemap Crawl

```bash
npx ts-node scanner.ts \
  --url "https://example.com" \
  --crawl-mode sitemap \
  --max-pages 50 \
  --output ./reports
```

### 3. With Custom Spec Rules

```bash
npx ts-node scanner.ts \
  --url "https://example.com" \
  --specs ../assets/example-specs.json \
  --output ./reports
```

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startUrls` | string[] | Yes | URLs to scan |
| `crawlMode` | enum | No | `single`, `sitemap`, `bfs`, `journey` (default: `single`) |
| `maxPages` | number | No | Maximum pages to scan (default: 10) |
| `maxDepth` | number | No | Maximum crawl depth for BFS (default: 3) |
| `viewports` | string[] | No | Viewport presets: `desktop`, `tablet`, `mobile` (default: `["desktop"]`) |
| `standards` | object | No | WCAG target: `{"wcag": "2.1-AA"}` or `{"wcag": "2.2-AA"}` |
| `auth` | object | No | Authentication: `{cookies: [...]}` or `{loginSteps: [...]}` |
| `customSpecs` | string/object | No | Path to spec rules JSON or inline rules |
| `allowDomains` | string[] | No | Allowed domains for crawling |
| `denyPatterns` | string[] | No | URL patterns to skip (e.g., `/logout`, `/delete`) |
| `outputFormats` | string[] | No | Output formats: `json`, `markdown`, `sarif` |
| `interactionPlan` | object[] | No | Scripted interactions (click menus, open modals) |

## Output

### Summary Object

```json
{
  "summary": {
    "pagesScanned": 42,
    "scanDuration": "2m 34s",
    "findings": {
      "critical": 3,
      "high": 11,
      "medium": 27,
      "low": 14,
      "info": 8
    }
  },
  "artifacts": {
    "reportMarkdownPath": "reports/report.md",
    "findingsJsonPath": "reports/findings.json",
    "sarifPath": "reports/findings.sarif.json",
    "screenshotsDir": "reports/screenshots/"
  }
}
```

### Finding Schema

Each finding includes:

```json
{
  "id": "axe-color-contrast|.cta-button|mobile|abc123",
  "category": "accessibility",
  "severity": "high",
  "confidence": "certain",
  "pageUrl": "https://example.com/pricing",
  "viewport": "mobile",
  "title": "Insufficient color contrast on primary CTA",
  "description": "The text color does not have sufficient contrast...",
  "stepsToReproduce": [
    "Navigate to https://example.com/pricing",
    "Locate the 'Get Started' button"
  ],
  "expected": "Contrast ratio >= 4.5:1 for normal text",
  "actual": "Contrast ratio is 2.8:1",
  "evidence": {
    "selectors": [".cta-button"],
    "domSnippet": "<button class=\"cta-button\">Get Started</button>",
    "screenshotPath": "screenshots/finding-001.png"
  },
  "wcag": {
    "version": "2.1",
    "level": "AA",
    "successCriteria": ["1.4.3"]
  },
  "suggestedFix": "Change text color to #1a1a1a or background to #ffffff",
  "references": ["https://www.w3.org/TR/WCAG21/#contrast-minimum"]
}
```

## Analyzers

### 1. Accessibility Analyzer (WCAG 2.x AA)

Uses **axe-core** to detect:
- Missing accessible names (labels, aria-label, aria-labelledby)
- Keyboard accessibility issues (focus traps, unreachable controls)
- Focus visible indicator problems
- Color contrast failures (text and UI components)
- Invalid ARIA usage
- Form error association issues
- Heading/landmark structure problems

**Confidence Levels:**
- `certain`: axe-core violation with clear evidence
- `likely`: heuristic detection with strong indicators
- `needs_review`: requires human verification

### 2. Usability Analyzer

Detects common usability problems:
- **Small tap targets** (< 44x44 px on mobile)
- **Overlapping elements** that obscure content
- **Clipped text** (content overflow)
- **Focus traps** (keyboard navigation loops)
- **Modal issues** (no dismiss, scroll not locked, focus not trapped)
- **Sticky header problems** (covering anchor targets)
- **Broken back navigation** detection

### 3. Spec Analyzer (Custom Rules)

Validates against team-defined specifications using a DSL:

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "icon-button-accessible-name",
      "type": "accessibility-spec",
      "selector": "button.icon-only",
      "assert": {
        "accessibleName": { "minLength": 1 }
      },
      "severity": "high",
      "message": "Icon-only buttons must have an accessible name"
    },
    {
      "id": "min-tap-target-mobile",
      "type": "usability-spec",
      "selector": "button, a, [role='button']",
      "when": { "viewport": "mobile" },
      "assert": {
        "boundingBox": { "minWidthPx": 44, "minHeightPx": 44 }
      },
      "severity": "medium"
    }
  ]
}
```

## Usage Examples

### Example 1: Quick Accessibility Audit

```typescript
import { scanWebsite } from './scripts/scanner';

const results = await scanWebsite({
  startUrls: ['https://example.com'],
  viewports: ['desktop', 'mobile'],
  standards: { wcag: '2.1-AA' },
  outputFormats: ['markdown', 'json']
});

console.log(`Found ${results.summary.findings.critical} critical issues`);
```

### Example 2: Authenticated App Scan

```typescript
const results = await scanWebsite({
  startUrls: ['https://app.example.com/dashboard'],
  auth: {
    loginSteps: [
      { action: 'navigate', url: 'https://app.example.com/login' },
      { action: 'type', selector: '#email', value: '${EMAIL}' },
      { action: 'type', selector: '#password', value: '${PASSWORD}' },
      { action: 'click', selector: 'button[type="submit"]' },
      { action: 'waitForNavigation' }
    ]
  },
  crawlMode: 'bfs',
  maxPages: 20
});
```

### Example 3: CI Gate Configuration

```typescript
const results = await scanWebsite({
  startUrls: ['https://staging.example.com'],
  viewports: ['desktop', 'mobile'],
  outputFormats: ['sarif']
});

// Fail CI if critical issues found
if (results.summary.findings.critical > 0) {
  process.exit(1);
}
```

### Example 4: Journey Mode

```typescript
const results = await scanWebsite({
  startUrls: ['https://shop.example.com'],
  crawlMode: 'journey',
  interactionPlan: [
    { action: 'click', selector: '.product-card:first-child' },
    { action: 'click', selector: '#add-to-cart' },
    { action: 'click', selector: '.cart-icon' },
    { action: 'click', selector: '#checkout-btn' }
  ]
});
```

## Severity Levels

| Severity | Description | Examples |
|----------|-------------|----------|
| **Critical** | Blocks primary tasks; severe a11y failures | Keyboard trap, missing form labels on required fields |
| **High** | Major impairment with workaround | Contrast failure on primary CTA, missing focus indicators |
| **Medium** | Meaningful friction or partial barrier | Small tap targets, heading structure issues |
| **Low** | Polish issues, minor inconsistencies | Color token violations, advisory improvements |
| **Info** | Suggestions and best practices | Optimization opportunities |

## File Structure

```
ui-bug-scanner/
├── SKILL.md                    # This file
├── scripts/
│   ├── scanner.ts              # Main orchestrator
│   ├── types.ts                # TypeScript interfaces
│   ├── analyzers/
│   │   ├── accessibility.ts    # axe-core integration
│   │   ├── usability.ts        # Heuristic checks
│   │   └── spec.ts             # Custom DSL engine
│   ├── crawlers/
│   │   ├── sitemap.ts          # Sitemap parser
│   │   └── bfs.ts              # BFS crawler
│   ├── reporters/
│   │   ├── markdown.ts         # Markdown generator
│   │   ├── json.ts             # JSON exporter
│   │   └── sarif.ts            # SARIF formatter
│   └── utils/
│       ├── browser.ts          # Playwright wrapper
│       ├── evidence.ts         # Screenshot/DOM capture
│       └── dedup.ts            # Finding deduplication
├── assets/
│   └── example-specs.json      # Example custom spec rules
└── references/
    ├── wcag-mapping.md         # WCAG criteria reference
    └── severity-guide.md       # Severity classification guide
```

## Safety and Security

- **Domain Allowlist**: Only scans explicitly allowed domains
- **Safe Mode**: Avoids destructive actions (submit, delete) by default
- **Credential Handling**: Accepts secrets via environment variables, never logs them
- **PII Protection**: Can mask sensitive form fields in screenshots
- **Rate Limiting**: Configurable concurrency and delays

## Limitations

- **Not a replacement for manual audits**: Some WCAG criteria require human judgment
- **Dynamic content**: May miss issues that appear after complex interactions
- **Visual design**: Cannot fully assess aesthetic or brand compliance
- **Context understanding**: Cannot evaluate content quality or accuracy

## References

- [WCAG 2.1 Specification](https://www.w3.org/TR/WCAG21/)
- [WCAG 2.2 Specification](https://www.w3.org/TR/WCAG22/)
- [axe-core Rules](https://github.com/dequelabs/axe-core)
- [Playwright Documentation](https://playwright.dev/)
