---
description: Check mobile usability issues on a URL
---

# Check Mobile Usability

You are using the **UI Bug Scanner** skill to check a URL for mobile-specific usability issues.

## Instructions

1. Ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. Run mobile-focused scan:
   ```bash
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --viewport mobile \
     --output ./reports
   ```

3. Focus on mobile-specific issues in the report:
   - Tap target sizes (minimum 44x44px)
   - Horizontal scrolling
   - Text readability
   - Touch-friendly interactions

## Mobile Usability Checklist

- [ ] Tap targets are at least 44x44px
- [ ] No horizontal scrolling at 375px width
- [ ] Text is readable without zooming
- [ ] Forms are easy to fill on mobile
- [ ] Buttons and links have adequate spacing
- [ ] Content doesn't overflow viewport

## Output Format

Provide:
- Mobile-specific issues found
- Screenshot references (if available)
- Priority fixes for mobile experience
- Responsive design recommendations
