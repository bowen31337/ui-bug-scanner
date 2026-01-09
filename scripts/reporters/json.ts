/**
 * JSON Report Generator
 * Creates machine-readable report in canonical schema
 */

import { Finding, ScanSummary, ScanArtifacts, Severity, FindingCategory } from '../types';

export interface JsonReport {
  $schema: string;
  version: string;
  generatedAt: string;
  summary: ScanSummary;
  artifacts: ScanArtifacts;
  findings: Finding[];
  metadata: {
    tool: string;
    toolVersion: string;
    standards: string[];
  };
}

export function generateJsonReport(
  summary: ScanSummary,
  findings: Finding[],
  artifacts: ScanArtifacts
): JsonReport {
  return {
    $schema: 'https://agentskills.io/schemas/ui-bug-scanner/v1.json',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary,
    artifacts,
    findings: findings.map(sanitizeFinding),
    metadata: {
      tool: 'ui-bug-scanner',
      toolVersion: '1.0.0',
      standards: ['WCAG 2.1 AA', 'WCAG 2.2 AA'],
    },
  };
}

/**
 * Sanitize finding for JSON output (remove undefined values, truncate long strings)
 */
function sanitizeFinding(finding: Finding): Finding {
  return {
    ...finding,
    description: truncate(finding.description, 2000),
    evidence: {
      ...finding.evidence,
      domSnippet: finding.evidence.domSnippet
        ? truncate(finding.evidence.domSnippet, 1000)
        : undefined,
      accessibilityTree: finding.evidence.accessibilityTree
        ? truncate(finding.evidence.accessibilityTree, 2000)
        : undefined,
    },
  };
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Generate a findings summary for quick parsing
 */
export function generateFindingsSummary(findings: Finding[]): {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<FindingCategory, number>;
  topIssues: Array<{ title: string; count: number; severity: Severity }>;
} {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const byCategory: Record<FindingCategory, number> = {
    accessibility: 0,
    usability: 0,
    spec: 0,
  };

  const issueCounts = new Map<string, { title: string; count: number; severity: Severity }>();

  for (const finding of findings) {
    bySeverity[finding.severity]++;
    byCategory[finding.category]++;

    // Group by rule/title
    const key = finding.ruleId || finding.title;
    const existing = issueCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      issueCounts.set(key, { title: finding.title, count: 1, severity: finding.severity });
    }
  }

  // Get top issues by count
  const topIssues = Array.from(issueCounts.values())
    .sort((a, b) => {
      // Sort by severity first, then by count
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    })
    .slice(0, 10);

  return {
    total: findings.length,
    bySeverity,
    byCategory,
    topIssues,
  };
}

/**
 * Convert findings to CSV format for spreadsheet import
 */
export function generateCsvReport(findings: Finding[]): string {
  const headers = [
    'ID',
    'Severity',
    'Category',
    'Confidence',
    'Title',
    'Page URL',
    'Viewport',
    'WCAG Criteria',
    'Selector',
    'Suggested Fix',
  ];

  const rows = findings.map((f) => [
    `"${escapeCsv(f.id)}"`,
    f.severity,
    f.category,
    f.confidence,
    `"${escapeCsv(f.title)}"`,
    `"${escapeCsv(f.pageUrl)}"`,
    f.viewport,
    `"${f.wcag?.successCriteria.join(', ') || ''}"`,
    `"${escapeCsv(f.evidence.selectors[0] || '')}"`,
    `"${escapeCsv(f.suggestedFix || '')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function escapeCsv(str: string): string {
  return str.replace(/"/g, '""').replace(/\n/g, ' ');
}
