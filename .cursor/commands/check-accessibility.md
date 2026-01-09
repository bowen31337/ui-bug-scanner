---
description: Check a URL for WCAG 2.x AA accessibility compliance
---

# Check Accessibility Compliance

You are using the **UI Bug Scanner** skill to check a URL for WCAG 2.1/2.2 Level AA accessibility compliance.

## Instructions

1. Ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. Run accessibility scan:
   ```bash
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --viewport desktop,mobile \
     --format json,markdown \
     --output ./reports
   ```

3. After scanning:
   - Focus on accessibility category findings
   - Group issues by WCAG success criteria
   - Provide specific fix recommendations

## WCAG Categories to Check

- **Perceivable**: Alt text, contrast, captions
- **Operable**: Keyboard access, focus, timing
- **Understandable**: Labels, errors, language
- **Robust**: Valid markup, ARIA usage

## Output Format

Provide:
- WCAG compliance summary (pass/fail by criterion)
- Critical accessibility blockers
- Issues grouped by WCAG principle
- Code examples for fixing each issue
- Links to WCAG documentation
