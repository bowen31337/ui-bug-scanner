---
description: Validate a URL against custom UI specification rules
---

# Validate UI Specifications

You are using the **UI Bug Scanner** skill to validate a website against custom UI specification rules.

## Instructions

1. Ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. If the user has custom spec rules, save them to a JSON file. Otherwise, use the default rules:
   ```bash
   # With default rules
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --viewport desktop,mobile \
     --output ./reports

   # With custom rules
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --specs ./assets/example-specs.json \
     --viewport desktop,mobile \
     --output ./reports
   ```

3. Review spec violations in the report.

## Custom Spec Rule Format

Users can provide rules like:
```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "button-min-size",
      "selector": "button",
      "assert": {
        "boundingBox": { "minWidthPx": 44, "minHeightPx": 44 }
      },
      "severity": "medium",
      "message": "Buttons must be at least 44x44px"
    }
  ]
}
```

## Output Format

Provide:
- Spec violations grouped by rule
- Element selectors that failed validation
- Suggested fixes for each violation
- Design system compliance percentage
