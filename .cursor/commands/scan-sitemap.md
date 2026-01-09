---
description: Crawl a website via sitemap and scan all pages for UI bugs
---

# Scan Website via Sitemap

You are using the **UI Bug Scanner** skill to crawl and scan an entire website using its sitemap.

## Instructions

1. First, ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. Run the sitemap crawler:
   ```bash
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --crawl-mode sitemap \
     --max-pages 50 \
     --viewport desktop,mobile \
     --output ./reports
   ```

3. After scanning completes:
   - Read `reports/report.md` for the full report
   - Read `reports/findings.json` for machine-readable results
   - Summarize findings across all scanned pages

4. If the user provided a URL, scan it. If not, ask for the website URL.

## Output Format

Provide:
- Number of pages scanned
- Aggregate issue counts by severity and category
- Pages with the most issues
- Common issues appearing across multiple pages
- Priority remediation recommendations
