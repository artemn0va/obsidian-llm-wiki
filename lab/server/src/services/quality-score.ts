import type { QAReport, QAFinding } from './qa.js';

export type QualityRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface IngestQualityScore {
  contentScore: number | null;
  structureScore: number | null;
  riskLevel: QualityRiskLevel;
  affectedFiles: number;
  reasons: {
    content: string[];
    structure: string[];
    risk: string[];
    actions: string[];
  };
  metrics: {
    thinPages: number;
    duplicateQuotes: number;
    missingSourceAttribution: number;
    brokenLinks: number;
    badSlugs: number;
    frontmatterIssues: number;
    promptLeaks: number;
    errors: number;
    warnings: number;
    info: number;
  };
  llmReview: {
    enabled: false;
    status: 'disabled';
    note: string;
  };
}

export function scoreIngestQuality(report: QAReport | null | undefined): IngestQualityScore {
  if (!report) {
    return {
      contentScore: null,
      structureScore: null,
      riskLevel: 'unknown',
      affectedFiles: 0,
      reasons: {
        content: ['No QA snapshot is available for this run.'],
        structure: ['Run scoring needs a QA snapshot captured after ingest.'],
        risk: ['Risk is unknown without QA data.'],
        actions: ['Run QA or trigger a new Lab ingest to capture score inputs.'],
      },
      metrics: emptyMetrics(),
      llmReview: disabledLlmReview(),
    };
  }

  const metrics = classifyFindings(report.findings);
  const affectedFiles = new Set(report.findings.map((finding) => finding.file)).size;
  const contentPenalty =
    Math.min(metrics.thinPages * 10, 40) +
    Math.min(metrics.duplicateQuotes * 8, 24) +
    Math.min(metrics.missingSourceAttribution * 15, 45);
  const structurePenalty =
    Math.min(metrics.brokenLinks * 12, 48) +
    Math.min(metrics.badSlugs * 15, 30) +
    Math.min(metrics.frontmatterIssues * 10, 40) +
    Math.min(metrics.promptLeaks * 25, 50) +
    Math.min(report.counts.error * 4, 20) +
    Math.min(report.counts.warning * 2, 16);
  const contentScore = clampScore(100 - contentPenalty);
  const structureScore = clampScore(100 - structurePenalty);
  const riskLevel = getRiskLevel(report, contentScore, structureScore, affectedFiles);

  return {
    contentScore,
    structureScore,
    riskLevel,
    affectedFiles,
    reasons: {
      content: contentReasons(metrics, contentScore),
      structure: structureReasons(metrics, structureScore),
      risk: riskReasons(report, riskLevel, affectedFiles, contentScore, structureScore),
      actions: actionReasons(metrics, riskLevel),
    },
    metrics,
    llmReview: disabledLlmReview(),
  };
}

function emptyMetrics(): IngestQualityScore['metrics'] {
  return {
    thinPages: 0,
    duplicateQuotes: 0,
    missingSourceAttribution: 0,
    brokenLinks: 0,
    badSlugs: 0,
    frontmatterIssues: 0,
    promptLeaks: 0,
    errors: 0,
    warnings: 0,
    info: 0,
  };
}

function classifyFindings(findings: QAFinding[]): IngestQualityScore['metrics'] {
  const metrics = emptyMetrics();

  for (const finding of findings) {
    if (finding.severity === 'error') metrics.errors += 1;
    if (finding.severity === 'warning') metrics.warnings += 1;
    if (finding.severity === 'info') metrics.info += 1;
    const text = `${finding.message} ${finding.suggestedFix}`.toLowerCase();

    if (text.includes('thin')) metrics.thinPages += 1;
    if (text.includes('duplicate quote')) metrics.duplicateQuotes += 1;
    if (text.includes('no sources array') || text.includes('source-backed attribution')) metrics.missingSourceAttribution += 1;
    if (text.includes('broken wiki link') || text.includes('raw source path')) metrics.brokenLinks += 1;
    if (text.includes('bad slug') || text.includes('non-ascii')) metrics.badSlugs += 1;
    if (text.includes('frontmatter') || text.includes('source_file')) metrics.frontmatterIssues += 1;
    if (text.includes('prompt artifact') || text.includes('active tag vocabulary') || text.includes('begin schema') || text.includes('validator')) {
      metrics.promptLeaks += 1;
    }
  }

  return metrics;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRiskLevel(report: QAReport, contentScore: number, structureScore: number, affectedFiles: number): QualityRiskLevel {
  if (report.counts.error > 0 || structureScore < 70 || contentScore < 60) return 'high';
  if (report.counts.warning > 2 || affectedFiles > 3 || structureScore < 85 || contentScore < 80) return 'medium';
  return 'low';
}

function contentReasons(metrics: IngestQualityScore['metrics'], score: number): string[] {
  const reasons: string[] = [];
  if (metrics.thinPages) reasons.push(`${metrics.thinPages} thin generated page${plural(metrics.thinPages)}.`);
  if (metrics.duplicateQuotes) reasons.push(`${metrics.duplicateQuotes} duplicate quote finding${plural(metrics.duplicateQuotes)}.`);
  if (metrics.missingSourceAttribution) reasons.push(`${metrics.missingSourceAttribution} page${plural(metrics.missingSourceAttribution)} missing source attribution.`);
  if (!reasons.length) reasons.push('No content-quality QA findings were detected.');
  reasons.push(`Content score is ${score}/100 from deterministic QA checks.`);
  return reasons;
}

function structureReasons(metrics: IngestQualityScore['metrics'], score: number): string[] {
  const reasons: string[] = [];
  if (metrics.brokenLinks) reasons.push(`${metrics.brokenLinks} broken or unsafe wiki link${plural(metrics.brokenLinks)}.`);
  if (metrics.badSlugs) reasons.push(`${metrics.badSlugs} slug/path quality issue${plural(metrics.badSlugs)}.`);
  if (metrics.frontmatterIssues) reasons.push(`${metrics.frontmatterIssues} frontmatter/schema issue${plural(metrics.frontmatterIssues)}.`);
  if (metrics.promptLeaks) reasons.push(`${metrics.promptLeaks} prompt/schema artifact leak${plural(metrics.promptLeaks)}.`);
  if (!reasons.length) reasons.push('No structural QA findings were detected.');
  reasons.push(`Structure score is ${score}/100 from deterministic QA checks.`);
  return reasons;
}

function riskReasons(
  report: QAReport,
  riskLevel: QualityRiskLevel,
  affectedFiles: number,
  contentScore: number,
  structureScore: number,
): string[] {
  return [
    `Risk is ${riskLevel} from ${report.counts.error} error${plural(report.counts.error)}, ${report.counts.warning} warning${plural(report.counts.warning)}, and ${affectedFiles} affected file${plural(affectedFiles)}.`,
    `Lowest score input is ${Math.min(contentScore, structureScore)}/100.`,
  ];
}

function actionReasons(metrics: IngestQualityScore['metrics'], riskLevel: QualityRiskLevel): string[] {
  const actions: string[] = [];
  if (metrics.brokenLinks || metrics.frontmatterIssues || metrics.promptLeaks) actions.push('Open QA Fix Center and apply deterministic safe fixes.');
  if (metrics.badSlugs) actions.push('Review bad slugs before rename because links need coordinated updates.');
  if (metrics.thinPages) actions.push('Consider Coarse ingest or merge low-value thin pages.');
  if (metrics.duplicateQuotes) actions.push('Keep one quote and merge nearby interpretation.');
  if (!actions.length && riskLevel === 'low') actions.push('No immediate quality action needed.');
  return actions;
}

function disabledLlmReview(): IngestQualityScore['llmReview'] {
  return {
    enabled: false,
    status: 'disabled',
    note: 'Optional LLM review is intentionally disabled for v1; score is deterministic.',
  };
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}
