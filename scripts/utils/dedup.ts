/**
 * Finding Deduplication and Clustering
 * Groups similar findings across pages to reduce noise
 */

import * as crypto from 'crypto';
import { Finding, Severity } from '../types';

export interface ClusteredFinding extends Finding {
  affectedPages: string[];
  occurrenceCount: number;
  representativeUrl: string;
}

/**
 * Generate a stable signature for deduplication
 */
export function generateSignature(finding: Finding): string {
  // Normalize the selector (remove dynamic parts)
  const normalizedSelector = finding.evidence.selectors[0]
    ?.replace(/:nth-child\(\d+\)/g, '')
    .replace(/:nth-of-type\(\d+\)/g, '')
    .replace(/#[a-zA-Z0-9_-]*\d+[a-zA-Z0-9_-]*/g, '[dynamic-id]')
    .replace(/\[\d+\]/g, '[n]') // Array indices
    .trim() || 'unknown';

  // Extract path pattern from URL (ignore query params and specific IDs)
  const urlPattern = extractUrlPattern(finding.pageUrl);

  const signatureBase = [
    finding.ruleId || finding.tool || 'unknown',
    normalizedSelector,
    finding.viewport,
    urlPattern,
  ].join('|');

  return crypto.createHash('md5').update(signatureBase).digest('hex');
}

/**
 * Extract URL pattern for grouping similar pages
 */
function extractUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    // Replace numeric IDs in path with placeholder
    const normalizedPath = parsed.pathname
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9]{8,}/gi, '/:hash');
    return `${parsed.hostname}${normalizedPath}`;
  } catch {
    return url;
  }
}

/**
 * Deduplicate and cluster findings
 */
export function deduplicateFindings(findings: Finding[]): ClusteredFinding[] {
  const clusters = new Map<string, Finding[]>();

  // Group findings by signature
  for (const finding of findings) {
    const signature = generateSignature(finding);
    const existing = clusters.get(signature) || [];
    existing.push(finding);
    clusters.set(signature, existing);
  }

  // Create clustered findings
  const result: ClusteredFinding[] = [];

  for (const [, group] of clusters) {
    // Take the first finding as the representative
    const representative = group[0];
    const affectedPages = [...new Set(group.map((f) => f.pageUrl))];

    result.push({
      ...representative,
      affectedPages,
      occurrenceCount: group.length,
      representativeUrl: representative.pageUrl,
      // Update ID to reflect clustering
      id: `clustered-${representative.id}`,
    });
  }

  // Sort by severity and occurrence count
  return result.sort((a, b) => {
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Higher occurrence count first
    return b.occurrenceCount - a.occurrenceCount;
  });
}

/**
 * Filter findings to unique issues per page
 */
export function uniqueFindingsPerPage(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.pageUrl}|${finding.ruleId || finding.tool}|${
      finding.evidence.selectors[0] || ''
    }`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(finding);
    }
  }

  return result;
}

/**
 * Group findings by category for reporting
 */
export function groupByCategory(
  findings: Finding[]
): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const existing = groups.get(finding.category) || [];
    existing.push(finding);
    groups.set(finding.category, existing);
  }

  return groups;
}

/**
 * Group findings by page URL
 */
export function groupByPage(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const existing = groups.get(finding.pageUrl) || [];
    existing.push(finding);
    groups.set(finding.pageUrl, existing);
  }

  return groups;
}

/**
 * Get top N most impactful findings
 */
export function getTopFindings(findings: Finding[], limit = 10): Finding[] {
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  return [...findings]
    .sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // Prefer certain confidence
      const confidenceOrder = { certain: 0, likely: 1, needs_review: 2 };
      return (
        confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
      );
    })
    .slice(0, limit);
}
