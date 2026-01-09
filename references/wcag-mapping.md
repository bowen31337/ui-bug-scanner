# WCAG Success Criteria Quick Reference

This document maps common UI issues to WCAG 2.1/2.2 Level AA success criteria.

## Perceivable (Principle 1)

### 1.1 Text Alternatives

| SC | Title | Common Issues |
|----|-------|---------------|
| 1.1.1 | Non-text Content | Missing alt text on images, decorative images not marked |

### 1.3 Adaptable

| SC | Title | Common Issues |
|----|-------|---------------|
| 1.3.1 | Info and Relationships | Missing form labels, improper heading hierarchy |
| 1.3.2 | Meaningful Sequence | Reading order doesn't match visual order |
| 1.3.3 | Sensory Characteristics | Instructions rely only on color/shape |

### 1.4 Distinguishable

| SC | Title | Common Issues |
|----|-------|---------------|
| 1.4.1 | Use of Color | Color-only indicators for errors/state |
| 1.4.3 | Contrast (Minimum) | Text contrast < 4.5:1 (normal) or < 3:1 (large) |
| 1.4.4 | Resize Text | Text doesn't scale to 200% without loss |
| 1.4.10 | Reflow | Horizontal scroll at 320px viewport |
| 1.4.11 | Non-text Contrast | UI components/graphics < 3:1 contrast |
| 1.4.12 | Text Spacing | Content lost when text spacing increased |

## Operable (Principle 2)

### 2.1 Keyboard Accessible

| SC | Title | Common Issues |
|----|-------|---------------|
| 2.1.1 | Keyboard | Functionality not keyboard accessible |
| 2.1.2 | No Keyboard Trap | Focus gets trapped in widgets |
| 2.1.4 | Character Key Shortcuts | Single-key shortcuts without modifier |

### 2.4 Navigable

| SC | Title | Common Issues |
|----|-------|---------------|
| 2.4.1 | Bypass Blocks | Missing skip links |
| 2.4.2 | Page Titled | Missing or non-descriptive page title |
| 2.4.3 | Focus Order | Illogical tab order |
| 2.4.4 | Link Purpose | Generic link text ("click here") |
| 2.4.6 | Headings and Labels | Missing/unhelpful headings |
| 2.4.7 | Focus Visible | No visible focus indicator |

### 2.5 Input Modalities

| SC | Title | Common Issues |
|----|-------|---------------|
| 2.5.1 | Pointer Gestures | Multipoint gestures without alternative |
| 2.5.2 | Pointer Cancellation | Actions triggered on down-event |
| 2.5.3 | Label in Name | Visible label differs from accessible name |
| 2.5.4 | Motion Actuation | Motion-only input without alternative |
| 2.5.5 | Target Size (2.2) | Touch targets < 24x24 px |

## Understandable (Principle 3)

### 3.1 Readable

| SC | Title | Common Issues |
|----|-------|---------------|
| 3.1.1 | Language of Page | Missing lang attribute on html |
| 3.1.2 | Language of Parts | Content in different language not marked |

### 3.2 Predictable

| SC | Title | Common Issues |
|----|-------|---------------|
| 3.2.1 | On Focus | Unexpected context change on focus |
| 3.2.2 | On Input | Form submits without warning |

### 3.3 Input Assistance

| SC | Title | Common Issues |
|----|-------|---------------|
| 3.3.1 | Error Identification | Errors not identified in text |
| 3.3.2 | Labels or Instructions | Missing form instructions |
| 3.3.3 | Error Suggestion | No suggestion for fixing errors |
| 3.3.4 | Error Prevention | No confirmation for legal/financial |

## Robust (Principle 4)

### 4.1 Compatible

| SC | Title | Common Issues |
|----|-------|---------------|
| 4.1.1 | Parsing | Duplicate IDs, malformed markup |
| 4.1.2 | Name, Role, Value | Custom widgets without ARIA |
| 4.1.3 | Status Messages | Status updates not announced |

---

## Severity Guidelines

### Critical (blocks users)
- 2.1.2 Keyboard Trap
- 1.1.1 Missing alt on critical images
- 4.1.2 Critical controls without names

### High (major barrier)
- 1.4.3 Contrast failures on primary content
- 2.4.7 No focus indicators
- 3.3.1 Errors not identified

### Medium (significant friction)
- 1.3.1 Heading structure issues
- 2.4.4 Unclear link purpose
- 2.5.5 Small touch targets

### Low (minor issues)
- 1.4.11 Non-text contrast
- 3.1.2 Language of parts
- Best practices not strictly required

---

## Resources

- [WCAG 2.1 Full Text](https://www.w3.org/TR/WCAG21/)
- [WCAG 2.2 Full Text](https://www.w3.org/TR/WCAG22/)
- [Understanding WCAG 2.1](https://www.w3.org/WAI/WCAG21/Understanding/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [axe-core Rules](https://dequeuniversity.com/rules/axe/)
