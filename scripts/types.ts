/**
 * UI Bug Scanner - Type Definitions
 * Canonical schema for inputs, outputs, and findings
 */

// ============================================================================
// Input Types
// ============================================================================

export type CrawlMode = 'single' | 'sitemap' | 'bfs' | 'journey';
export type ViewportPreset = 'desktop' | 'tablet' | 'mobile';
export type OutputFormat = 'json' | 'markdown' | 'sarif';
export type WCAGVersion = '2.1-AA' | '2.2-AA';

export interface ViewportConfig {
  name: ViewportPreset;
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<ViewportPreset, ViewportConfig> = {
  desktop: { name: 'desktop', width: 1920, height: 1080 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  mobile: { name: 'mobile', width: 375, height: 812 },
};

export interface AuthCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface LoginStep {
  action: 'navigate' | 'type' | 'click' | 'waitForNavigation' | 'waitForSelector';
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface AuthConfig {
  cookies?: AuthCookie[];
  headers?: Record<string, string>;
  loginSteps?: LoginStep[];
}

export interface InteractionStep {
  action: 'click' | 'type' | 'hover' | 'scroll' | 'wait' | 'press';
  selector?: string;
  value?: string;
  key?: string;
  duration?: number;
  x?: number;
  y?: number;
}

export interface ScanInput {
  startUrls: string[];
  crawlMode?: CrawlMode;
  maxPages?: number;
  maxDepth?: number;
  allowDomains?: string[];
  denyPatterns?: string[];
  viewports?: ViewportPreset[];
  locales?: string[];
  standards?: { wcag: WCAGVersion };
  auth?: AuthConfig;
  customSpecs?: string | SpecRuleset;
  interactionPlan?: InteractionStep[];
  outputFormats?: OutputFormat[];
  outputDir?: string;
  concurrency?: number;
  timeout?: number;
}

// ============================================================================
// Custom Spec DSL Types
// ============================================================================

export type SpecRuleType = 'accessibility-spec' | 'usability-spec' | 'ui-token-spec';

export interface BoundingBoxAssertion {
  minWidthPx?: number;
  minHeightPx?: number;
  maxWidthPx?: number;
  maxHeightPx?: number;
}

export interface AccessibleNameAssertion {
  minLength?: number;
  pattern?: string;
  required?: boolean;
}

export interface ComputedStyleAssertion {
  property: string;
  in?: string[];
  notIn?: string[];
  matches?: string;
  minValue?: number;
  maxValue?: number;
}

export interface RoleAssertion {
  equals?: string;
  in?: string[];
}

export interface SpecRuleAssertion {
  boundingBox?: BoundingBoxAssertion;
  accessibleName?: AccessibleNameAssertion;
  computedStyle?: ComputedStyleAssertion;
  role?: RoleAssertion;
  attribute?: {
    name: string;
    exists?: boolean;
    value?: string;
    pattern?: string;
  };
  focusable?: boolean;
  visible?: boolean;
}

export interface SpecRuleCondition {
  viewport?: ViewportPreset;
  selector?: string;
  hasAttribute?: string;
}

export interface SpecRule {
  id: string;
  type: SpecRuleType;
  selector: string;
  when?: SpecRuleCondition;
  assert: SpecRuleAssertion;
  severity: Severity;
  message: string;
  suggestedFix?: string;
  references?: string[];
}

export interface SpecRuleset {
  version: string;
  rules: SpecRule[];
}

// ============================================================================
// Finding Types (Canonical Schema)
// ============================================================================

export type FindingCategory = 'accessibility' | 'usability' | 'spec';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'certain' | 'likely' | 'needs_review';

export interface WCAGReference {
  version: '2.1' | '2.2';
  level: 'A' | 'AA' | 'AAA';
  successCriteria: string[];
  techniqueRefs?: string[];
}

export interface FindingEvidence {
  selectors: string[];
  domSnippet?: string;
  screenshotPath?: string;
  videoPath?: string;
  accessibilityTree?: string;
  computedStyles?: Record<string, string>;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  pageUrl: string;
  viewport: ViewportPreset;
  locale?: string;
  title: string;
  description: string;
  stepsToReproduce: string[];
  expected: string;
  actual: string;
  evidence: FindingEvidence;
  wcag?: WCAGReference;
  tool?: string;
  ruleId?: string;
  suggestedFix?: string;
  devNotes?: string;
  references?: string[];
  affectedPages?: string[];
  occurrenceCount?: number;
}

// ============================================================================
// Output Types
// ============================================================================

export interface ScanSummary {
  pagesScanned: number;
  scanDuration: string;
  startTime: string;
  endTime: string;
  findings: Record<Severity, number>;
  byCategory: Record<FindingCategory, number>;
  viewportsScanned: ViewportPreset[];
  errors: ScanError[];
}

export interface ScanError {
  pageUrl: string;
  viewport: ViewportPreset;
  error: string;
  timestamp: string;
}

export interface ScanArtifacts {
  reportMarkdownPath?: string;
  findingsJsonPath?: string;
  sarifPath?: string;
  screenshotsDir?: string;
}

export interface ScanOutput {
  summary: ScanSummary;
  artifacts: ScanArtifacts;
  topFindings: Finding[];
  allFindings: Finding[];
}

// ============================================================================
// Internal Types
// ============================================================================

export interface PageScanJob {
  url: string;
  viewport: ViewportConfig;
  locale?: string;
}

export interface PageScanResult {
  job: PageScanJob;
  findings: Finding[];
  error?: string;
  screenshotPath?: string;
  domSnapshot?: string;
  accessibilityTree?: string;
  duration: number;
}

export interface AnalyzerResult {
  findings: Finding[];
  rawData?: unknown;
}

export interface BrowserContext {
  page: import('playwright').Page;
  viewport: ViewportConfig;
  locale?: string;
}

// ============================================================================
// SARIF Types (for code scanning integration)
// ============================================================================

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: { text: string };
  locations: SarifLocation[];
  fingerprints?: Record<string, string>;
}

export interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region?: { startLine?: number };
  };
  logicalLocations?: Array<{
    name: string;
    kind: string;
  }>;
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  defaultConfiguration?: { level: string };
}

export interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}
