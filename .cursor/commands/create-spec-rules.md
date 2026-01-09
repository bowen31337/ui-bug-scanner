---
description: Create custom UI specification rules for the scanner
---

# Create Custom Spec Rules

You are helping the user create custom UI specification rules for the **UI Bug Scanner**.

## Instructions

1. Ask the user what UI requirements they want to enforce:
   - Component size requirements
   - Color/typography constraints
   - Accessibility requirements
   - Design system rules

2. Read the example specs for reference:
   ```
   assets/example-specs.json
   ```

3. Create a custom rules JSON file based on their requirements.

## Rule Structure

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "unique-rule-id",
      "type": "accessibility-spec | usability-spec | ui-token-spec",
      "selector": "CSS selector",
      "when": {
        "viewport": "mobile | tablet | desktop",
        "hasAttribute": "attribute-name"
      },
      "assert": {
        "boundingBox": { "minWidthPx": 44, "minHeightPx": 44 },
        "accessibleName": { "minLength": 1 },
        "computedStyle": { "property": "color", "in": ["rgb(0,0,0)"] },
        "attribute": { "name": "aria-label", "exists": true },
        "focusable": true,
        "visible": true
      },
      "severity": "critical | high | medium | low | info",
      "message": "Human-readable error message",
      "suggestedFix": "How to fix the issue",
      "references": ["https://..."]
    }
  ]
}
```

## Available Assertions

| Assertion | Description |
|-----------|-------------|
| `boundingBox` | Check element dimensions |
| `accessibleName` | Check accessible name exists/length |
| `computedStyle` | Check CSS property values |
| `attribute` | Check HTML attributes |
| `role` | Check ARIA role |
| `focusable` | Check if element is focusable |
| `visible` | Check if element is visible |

## Output

Save the rules to `assets/custom-specs.json` and provide the command to run the scan with these rules.
