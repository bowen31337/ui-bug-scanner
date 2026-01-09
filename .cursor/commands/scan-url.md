---
description: Scan a URL for accessibility and usability issues
---

# Scan URL for UI Bugs

You are using the **UI Bug Scanner** skill to scan a website for accessibility (WCAG 2.x AA), usability issues, and UI spec violations.

## Instructions

1. First, ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. Run the scanner on the provided URL:
   ```bash
   npx ts-node scripts/scanner.ts --url "$ARGUMENTS" --viewport desktop,mobile --output ./reports
   ```

3. After scanning completes, read and summarize the report:
   - Open `reports/report.md` to review findings
   - Highlight critical and high severity issues
   - Provide actionable recommendations

4. If the user provided a specific URL, scan it. If not, ask them for the URL to scan.

## Output Format

Provide a summary including:
- Total issues found by severity (Critical, High, Medium, Low)
- Top 5 most important issues to fix
- Quick wins that can be addressed immediately
- Links to relevant WCAG criteria for accessibility issues
