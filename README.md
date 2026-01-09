# UI Bug Scanner - Agent Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-green.svg)](https://playwright.dev/)
[![axe-core](https://img.shields.io/badge/axe--core-4.8-orange.svg)](https://github.com/dequelabs/axe-core)

A comprehensive **Agent Skill** for scanning websites to detect UI bugs including accessibility issues (WCAG 2.x AA compliance), usability problems, and custom UI specification violations. Generates developer-ready bug reports with evidence, screenshots, and actionable remediation guidance.

## 🎯 Features

- **🔍 Accessibility Scanning**: WCAG 2.1/2.2 Level AA compliance using axe-core
- **🖱️ Usability Checks**: Tap targets, overlaps, focus traps, modal behavior
- **📐 Custom Spec Validation**: Team-defined design system rules via JSON DSL
- **🌐 Multi-Viewport Testing**: Desktop, tablet, and mobile viewports
- **🕷️ Smart Crawling**: Sitemap, BFS, or journey-based page discovery
- **🔐 Authentication Support**: Cookies, headers, or scripted login flows
- **📊 Multiple Report Formats**: Markdown, JSON, and SARIF (CI-ready)
- **🎯 Finding Deduplication**: Clusters similar issues across pages
- **📸 Evidence Capture**: Screenshots, DOM snippets, accessibility trees

## 🚀 Quick Start

### Installation

```bash
npm install
npx playwright install chromium
```

### Basic Usage

```bash
# Scan a single URL
npx ts-node scripts/scanner.ts --url https://example.com

# Scan with multiple viewports
npx ts-node scripts/scanner.ts \
  --url https://example.com \
  --viewport desktop,mobile

# Crawl via sitemap
npx ts-node scripts/scanner.ts \
  --url https://example.com \
  --crawl-mode sitemap \
  --max-pages 50 \
  --output ./reports
```

### Programmatic Usage

```typescript
import { scanWebsite } from './scripts/scanner';

const results = await scanWebsite({
  startUrls: ['https://example.com'],
  viewports: ['desktop', 'mobile'],
  standards: { wcag: '2.1-AA' },
  outputFormats: ['markdown', 'json', 'sarif']
});

console.log(`Found ${results.summary.findings.critical} critical issues`);
```

## 📖 Documentation

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startUrls` | `string[]` | Yes | URLs to scan |
| `crawlMode` | `enum` | No | `single`, `sitemap`, `bfs`, `journey` (default: `single`) |
| `maxPages` | `number` | No | Maximum pages to scan (default: 10) |
| `viewports` | `string[]` | No | `desktop`, `tablet`, `mobile` (default: `["desktop"]`) |
| `standards` | `object` | No | `{"wcag": "2.1-AA"}` or `{"wcag": "2.2-AA"}` |
| `auth` | `object` | No | Cookies, headers, or login steps |
| `customSpecs` | `string\|object` | No | Path to spec rules JSON or inline rules |
| `outputFormats` | `string[]` | No | `json`, `markdown`, `sarif` |

### Crawl Modes

- **`single`**: Scan only the provided URLs
- **`sitemap`**: Discover URLs from `/sitemap.xml`
- **`bfs`**: Breadth-first crawl following internal links
- **`journey`**: Scripted user journey with interaction plan

### Custom Spec Rules

Define your own UI specification rules using a simple JSON DSL:

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
      "severity": "medium",
      "message": "Interactive controls must be at least 44x44 px on mobile"
    }
  ]
}
```

See [`assets/example-specs.json`](./assets/example-specs.json) for more examples.

### Report Formats

#### Markdown Report
Human-readable report with findings grouped by severity, category, or page. Includes screenshots, DOM snippets, and remediation guidance.

#### JSON Report
Machine-readable canonical format with full finding details. Suitable for programmatic processing and integration.

#### SARIF Report
Static Analysis Results Interchange Format compatible with:
- GitHub Code Scanning
- Azure DevOps Security Scanner
- Other SARIF-compatible tools

## 🔧 CI/CD Integration

### GitHub Actions Example

```yaml
name: UI Bug Scan

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install chromium
      - run: npx ts-node scripts/scanner.ts --url ${{ secrets.STAGING_URL }} --format sarif
      - uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: reports/findings.sarif.json
```

### Exit Codes

- `0`: Scan completed successfully (may have findings)
- `1`: Critical issues found (use for CI gates)

## 📊 Finding Schema

Each finding includes:

```typescript
{
  id: string;                    // Stable hash identifier
  category: 'accessibility' | 'usability' | 'spec';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'certain' | 'likely' | 'needs_review';
  pageUrl: string;
  viewport: 'desktop' | 'tablet' | 'mobile';
  title: string;
  description: string;
  stepsToReproduce: string[];
  expected: string;
  actual: string;
  evidence: {
    selectors: string[];
    domSnippet?: string;
    screenshotPath?: string;
  };
  wcag?: {
    version: '2.1' | '2.2';
    level: 'AA';
    successCriteria: string[];
  };
  suggestedFix?: string;
  references?: string[];
}
```

## 🏗️ Architecture

```
┌─────────────────┐
│   Scanner CLI   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│Crawler│ │Browser│
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
    ┌────▼────┐
    │Analyzers│
    ├─────────┤
    │ • A11y  │
    │ • UX    │
    │ • Spec  │
    └────┬────┘
         │
    ┌────▼────┐
    │Reporters│
    ├──────────┤
    │ • Markdown│
    │ • JSON    │
    │ • SARIF   │
    └──────────┘
```

## 🧪 Testing

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Run scanner on example site
npx ts-node scripts/scanner.ts --url https://example.com --output ./test-reports
```

## 📚 References

- [WCAG 2.1 Specification](https://www.w3.org/TR/WCAG21/)
- [WCAG 2.2 Specification](https://www.w3.org/TR/WCAG22/)
- [axe-core Documentation](https://github.com/dequelabs/axe-core)
- [Playwright Documentation](https://playwright.dev/)
- [Agent Skills Specification](https://agentskills.io/specification)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Deque Systems](https://www.deque.com/) for axe-core
- [Microsoft](https://www.microsoft.com/) for Playwright
- [W3C](https://www.w3.org/) for WCAG guidelines

## 📧 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Made with ❤️ for accessible web experiences**
