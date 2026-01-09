---
description: Get fix recommendations for a specific accessibility issue
---

# Fix Accessibility Issue

You are using the **UI Bug Scanner** skill references to provide detailed fix recommendations for accessibility issues.

## Instructions

1. Read the WCAG mapping reference:
   ```
   references/wcag-mapping.md
   ```

2. Read the severity guide:
   ```
   references/severity-guide.md
   ```

3. Based on the user's described issue or WCAG criterion, provide:
   - Explanation of the WCAG requirement
   - Why it matters for users
   - Code examples showing the fix
   - Testing recommendations

## Common Issues and Fixes

### Missing Alt Text (WCAG 1.1.1)
```html
<!-- Before -->
<img src="photo.jpg">

<!-- After (informative) -->
<img src="photo.jpg" alt="Team meeting in conference room">

<!-- After (decorative) -->
<img src="decorative.jpg" alt="" role="presentation">
```

### Color Contrast (WCAG 1.4.3)
- Normal text: 4.5:1 minimum ratio
- Large text (18pt+ or 14pt bold): 3:1 minimum ratio

### Missing Form Labels (WCAG 1.3.1)
```html
<!-- Before -->
<input type="email" placeholder="Email">

<!-- After -->
<label for="email">Email</label>
<input type="email" id="email">
```

## Output Format

Provide:
- WCAG success criterion reference
- Impact on users with disabilities
- Before/after code examples
- Testing method to verify the fix
