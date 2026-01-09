/**
 * SARIF Report Generator
 * Creates Static Analysis Results Interchange Format for code scanning integrations
 * Compatible with GitHub Code Scanning, Azure DevOps, and other SARIF consumers
 */

import {
  Finding,
  Severity,
  SarifReport,
  SarifRun,
  SarifRule,
  SarifResult,
} from '../types';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';

export function generateSarifReport(findings: Finding[]): SarifReport {
  // Collect unique rules from findings
  const rulesMap = new Map<string, SarifRule>();

  for (const finding of findings) {
    const ruleId = finding.ruleId || generateRuleId(finding);
    
    if (!rulesMap.has(ruleId)) {
      rulesMap.set(ruleId, {
        id: ruleId,
        name: sanitizeRuleName(finding.title),
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.description.substring(0, 500) },
        helpUri: finding.references?.[0],
        defaultConfiguration: {
          level: severityToSarifLevel(finding.severity),
        },
      });
    }
  }

  // Convert findings to SARIF results
  const results: SarifResult[] = findings.map((finding) => ({
    ruleId: finding.ruleId || generateRuleId(finding),
    level: severityToSarifLevel(finding.severity),
    message: { text: formatSarifMessage(finding) },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.pageUrl },
          region: { startLine: 1 }, // Web pages don't have line numbers, use 1
        },
        logicalLocations: finding.evidence.selectors.map((selector) => ({
          name: selector,
          kind: 'element',
        })),
      },
    ],
    fingerprints: {
      'ui-bug-scanner/v1': finding.id,
    },
  }));

  const run: SarifRun = {
    tool: {
      driver: {
        name: 'ui-bug-scanner',
        version: '1.0.0',
        informationUri: 'https://agentskills.io/skills/ui-bug-scanner',
        rules: Array.from(rulesMap.values()),
      },
    },
    results,
  };

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [run],
  };
}

function severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' | 'none' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'note';
    default:
      return 'none';
  }
}

function generateRuleId(finding: Finding): string {
  // Generate a rule ID from the finding if none exists
  const prefix = finding.category === 'accessibility' ? 'a11y' : 
                 finding.category === 'usability' ? 'ux' : 'spec';
  const slug = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 40);
  return `${prefix}/${slug}`;
}

function sanitizeRuleName(title: string): string {
  // Convert title to PascalCase rule name
  return title
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 60);
}

function formatSarifMessage(finding: Finding): string {
  const parts: string[] = [finding.description];

  if (finding.wcag) {
    parts.push(`WCAG: ${finding.wcag.successCriteria.join(', ')}`);
  }

  if (finding.evidence.selectors.length > 0) {
    parts.push(`Selector: ${finding.evidence.selectors[0]}`);
  }

  if (finding.suggestedFix) {
    parts.push(`Fix: ${finding.suggestedFix}`);
  }

  return parts.join(' | ');
}

/**
 * Merge multiple SARIF reports into one
 * Useful when scanning multiple pages/viewports
 */
export function mergeSarifReports(reports: SarifReport[]): SarifReport {
  if (reports.length === 0) {
    return {
      $schema: SARIF_SCHEMA,
      version: SARIF_VERSION,
      runs: [],
    };
  }

  if (reports.length === 1) {
    return reports[0];
  }

  // Merge all runs and deduplicate rules
  const allRules = new Map<string, SarifRule>();
  const allResults: SarifResult[] = [];

  for (const report of reports) {
    for (const run of report.runs) {
      // Collect rules
      for (const rule of run.tool.driver.rules) {
        if (!allRules.has(rule.id)) {
          allRules.set(rule.id, rule);
        }
      }

      // Collect results
      allResults.push(...run.results);
    }
  }

  // Deduplicate results by fingerprint
  const uniqueResults = new Map<string, SarifResult>();
  for (const result of allResults) {
    const fingerprint = result.fingerprints?.['ui-bug-scanner/v1'] || JSON.stringify(result);
    if (!uniqueResults.has(fingerprint)) {
      uniqueResults.set(fingerprint, result);
    }
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'ui-bug-scanner',
            version: '1.0.0',
            informationUri: 'https://agentskills.io/skills/ui-bug-scanner',
            rules: Array.from(allRules.values()),
          },
        },
        results: Array.from(uniqueResults.values()),
      },
    ],
  };
}

/**
 * Filter SARIF results by severity threshold
 * Useful for CI gates
 */
export function filterSarifBySeverity(
  report: SarifReport,
  minLevel: 'error' | 'warning' | 'note'
): SarifReport {
  const levelOrder = { error: 0, warning: 1, note: 2, none: 3 };
  const minOrder = levelOrder[minLevel];

  return {
    ...report,
    runs: report.runs.map((run) => ({
      ...run,
      results: run.results.filter((result) => {
        const resultOrder = levelOrder[result.level];
        return resultOrder <= minOrder;
      }),
    })),
  };
}

/**
 * Get summary statistics from SARIF report
 */
export function getSarifStats(report: SarifReport): {
  totalFindings: number;
  byLevel: Record<string, number>;
  byRule: Array<{ ruleId: string; count: number }>;
} {
  const byLevel: Record<string, number> = { error: 0, warning: 0, note: 0, none: 0 };
  const byRuleMap = new Map<string, number>();

  for (const run of report.runs) {
    for (const result of run.results) {
      byLevel[result.level]++;
      byRuleMap.set(result.ruleId, (byRuleMap.get(result.ruleId) || 0) + 1);
    }
  }

  const byRule = Array.from(byRuleMap.entries())
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalFindings: report.runs.reduce((sum, run) => sum + run.results.length, 0),
    byLevel,
    byRule,
  };
}
