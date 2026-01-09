# Severity Classification Guide

This guide helps classify UI bug findings into appropriate severity levels.

## Severity Levels

### 🔴 Critical

**Definition:** Completely blocks users from completing primary tasks. Severe accessibility failures that exclude entire user groups.

**Characteristics:**
- Users cannot proceed without resolving the issue
- Assistive technology users completely blocked
- Legal compliance risk (ADA, Section 508)

**Examples:**
- Keyboard trap preventing page navigation
- Missing accessible names on critical form fields
- Login/checkout flow inaccessible by keyboard
- Core functionality broken at common viewport
- Videos with no captions and no transcript

**WCAG Criteria (typically Critical):**
- 2.1.2 No Keyboard Trap
- 1.1.1 Non-text Content (critical images/controls)
- 4.1.2 Name, Role, Value (critical controls)

---

### 🟠 High

**Definition:** Major impairment but workarounds may exist. Significant barriers for users with disabilities.

**Characteristics:**
- Primary functionality significantly hindered
- Workaround exists but is burdensome
- Affects large portion of users with disabilities

**Examples:**
- Color contrast failures on primary CTAs
- Missing focus indicators (users can't see where they are)
- Form errors not programmatically associated
- Missing skip links on navigation-heavy pages
- Images convey information but lack alt text

**WCAG Criteria (typically High):**
- 1.4.3 Contrast (Minimum) - primary content
- 2.4.7 Focus Visible
- 3.3.1 Error Identification
- 1.3.1 Info and Relationships

---

### 🟡 Medium

**Definition:** Meaningful friction or partial barriers. Users can complete tasks but with difficulty.

**Characteristics:**
- Secondary functionality affected
- Causes confusion or frustration
- Partial barrier for some user groups

**Examples:**
- Touch targets below 44x44px on mobile
- Heading structure issues (skipped levels)
- Generic link text ("click here", "read more")
- Content reflows poorly at zoom levels
- Form validation unclear but functional

**WCAG Criteria (typically Medium):**
- 2.5.5 Target Size
- 1.3.1 Info and Relationships (headings)
- 2.4.4 Link Purpose
- 1.4.10 Reflow
- 3.3.2 Labels or Instructions

---

### 🔵 Low

**Definition:** Polish issues and minor inconsistencies. Best practices that enhance experience but aren't blocking.

**Characteristics:**
- Minor impact on user experience
- Primarily affects efficiency, not completion
- May affect edge cases or specific contexts

**Examples:**
- Non-text contrast slightly below 3:1
- Missing lang attribute on foreign phrases
- Redundant title attributes
- Minor focus order issues
- Decorative images with non-empty alt

**WCAG Criteria (typically Low):**
- 1.4.11 Non-text Contrast
- 3.1.2 Language of Parts
- Best practices beyond AA requirements

---

### ⚪ Info

**Definition:** Suggestions and optimization opportunities. Not failures, but areas for improvement.

**Characteristics:**
- Enhancement recommendations
- Performance suggestions
- Future-proofing advice

**Examples:**
- ARIA usage that could be simplified
- Semantic alternatives available
- Performance optimizations for a11y tree
- Emerging best practices

---

## Confidence Levels

Combine severity with confidence to prioritize work:

| Confidence | Definition | Action |
|------------|------------|--------|
| **Certain** | Automated tool verified with high accuracy | Fix immediately based on severity |
| **Likely** | Strong indicators but may need verification | Verify then fix |
| **Needs Review** | Cannot be automatically verified | Human review required |

### Confidence Matrix

| Severity + Confidence | Priority |
|----------------------|----------|
| Critical + Certain | P0 - Fix now |
| Critical + Likely | P0 - Verify and fix |
| Critical + Needs Review | P1 - Review urgently |
| High + Certain | P1 - Fix soon |
| High + Likely | P1 - Verify and fix |
| High + Needs Review | P2 - Review this sprint |
| Medium + Certain | P2 - Plan fix |
| Medium + Likely | P2 - Verify when time |
| Low + Any | P3 - Nice to have |
| Info + Any | Backlog |

---

## Category-Specific Guidance

### Accessibility Issues

Severity is based on:
1. Which users are affected (everyone vs. specific disability groups)
2. What functionality is blocked
3. Whether workarounds exist
4. WCAG conformance level (A > AA > AAA)

### Usability Issues

Severity is based on:
1. Frequency of occurrence
2. Impact on task completion
3. User frustration level
4. Affected viewport/device types

### Spec Violations

Severity should be defined in the spec rule itself based on:
1. Brand/design system importance
2. User impact
3. Consistency requirements

---

## Examples by Issue Type

### Form Issues
| Issue | Typical Severity |
|-------|------------------|
| Missing labels on required fields | Critical |
| Error messages not associated | High |
| Placeholder text as only label | High |
| Missing autocomplete attributes | Low |

### Navigation Issues
| Issue | Typical Severity |
|-------|------------------|
| Keyboard trap | Critical |
| No skip link (nav-heavy page) | High |
| Focus order slightly off | Medium |
| Missing landmark regions | Medium |

### Visual Issues
| Issue | Typical Severity |
|-------|------------------|
| Primary CTA contrast failure | High |
| Secondary text contrast failure | Medium |
| Decorative element contrast | Low |
| Focus indicator missing | High |

### Mobile Issues
| Issue | Typical Severity |
|-------|------------------|
| Touch target 30x30px | Medium |
| Horizontal scroll | High |
| Text doesn't scale | Medium |
| Pinch zoom disabled | High |
