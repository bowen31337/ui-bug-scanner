---
description: Generate SARIF report for CI/CD integration
---

# Generate SARIF Report

You are using the **UI Bug Scanner** skill to generate a SARIF (Static Analysis Results Interchange Format) report for CI/CD integration.

## Instructions

1. Ensure dependencies are installed:
   ```bash
   cd ui-bug-scanner
   npm install
   npx playwright install chromium
   ```

2. Run scan with SARIF output:
   ```bash
   npx ts-node scripts/scanner.ts \
     --url "$ARGUMENTS" \
     --viewport desktop,mobile \
     --format sarif,json \
     --output ./reports
   ```

3. The SARIF file will be at `reports/findings.sarif.json`

4. Provide instructions for CI integration.

## GitHub Actions Integration

```yaml
- name: UI Bug Scan
  run: npx ts-node scripts/scanner.ts --url $URL --format sarif
  
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: reports/findings.sarif.json
```

## Output Format

Provide:
- Location of generated SARIF file
- Summary of findings in SARIF format
- CI/CD integration code snippets
- Exit code behavior (1 if critical issues found)
