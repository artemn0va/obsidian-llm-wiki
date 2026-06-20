import {
  GranularityDecision,
  LLMClient,
  LLMWikiSettings,
  ResolvedExtractionGranularity,
} from '../types';
import { parseJsonResponse } from '../core/json';
import { CUSTOM_LIMIT_MAX, CUSTOM_LIMIT_MIN } from '../constants';

const PREFLIGHT_MODES: readonly ResolvedExtractionGranularity[] = ['coarse', 'standard', 'fine', 'custom'];
const PREFLIGHT_MAX_TOKENS = 700;
const EXCERPT_CHARS = 1600;

interface PreflightInput {
  settings: LLMWikiSettings;
  client: LLMClient;
  sourcePath: string;
  basename: string;
  content: string;
}

function clampLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(CUSTOM_LIMIT_MIN, Math.min(CUSTOM_LIMIT_MAX, Math.round(value)));
}

function textField(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function fallbackDecision(warning: string): GranularityDecision {
  return {
    requested: 'auto',
    resolved: 'standard',
    source_kind: 'unknown',
    reason: 'Auto preflight failed; using standard granularity.',
    warning,
  };
}

export async function parsePreflightDecision(response: string): Promise<GranularityDecision> {
  const raw = await parseJsonResponse(response);
  if (!raw) return fallbackDecision('Auto preflight returned invalid JSON.');

  const mode = raw.granularity;
  if (typeof mode !== 'string' || !PREFLIGHT_MODES.includes(mode as ResolvedExtractionGranularity)) {
    return fallbackDecision('Auto preflight returned an invalid granularity.');
  }

  const resolved = mode as ResolvedExtractionGranularity;
  const decision: GranularityDecision = {
    requested: 'auto',
    resolved,
    source_kind: textField(raw.source_kind, 'unspecified', 80),
    reason: textField(raw.reason, 'No reason provided.', 240),
  };

  if (resolved === 'custom') {
    decision.customEntityLimit = clampLimit(raw.customEntityLimit) ?? 5;
    decision.customConceptLimit = clampLimit(raw.customConceptLimit) ?? 5;
  }

  return decision;
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1].trim().slice(0, 1200) : '(none)';
}

function extractTags(frontmatter: string): string {
  const tagLine = frontmatter.match(/^tags:\s*(.+)$/m);
  if (tagLine) return tagLine[1].trim().slice(0, 300);
  const block = frontmatter.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
  return block ? block[1].trim().replace(/\n\s*/g, ', ').slice(0, 300) : '(none)';
}

function extractHeadings(content: string): string {
  const headings = content
    .split(/\r?\n/)
    .filter(line => /^#{1,6}\s+\S/.test(line.trim()))
    .slice(0, 40);
  return headings.length > 0 ? headings.join('\n') : '(none)';
}

function excerpt(content: string, start: number): string {
  return content.slice(Math.max(0, start), Math.max(0, start) + EXCERPT_CHARS).trim();
}

export function buildPreflightProfile(sourcePath: string, basename: string, content: string): string {
  const middleStart = Math.max(0, Math.floor(content.length / 2) - Math.floor(EXCERPT_CHARS / 2));
  const endStart = Math.max(0, content.length - EXCERPT_CHARS);
  const frontmatter = extractFrontmatter(content);
  const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;

  return [
    `path: ${sourcePath}`,
    `filename: ${basename}`,
    `chars: ${content.length}`,
    `lines: ${lineCount}`,
    `tags: ${extractTags(frontmatter)}`,
    '',
    'frontmatter:',
    frontmatter,
    '',
    'outline:',
    extractHeadings(content),
    '',
    'excerpt_begin:',
    excerpt(content, 0),
    '',
    'excerpt_middle:',
    excerpt(content, middleStart),
    '',
    'excerpt_end:',
    excerpt(content, endStart),
  ].join('\n');
}

export function buildPreflightPrompt(profile: string): string {
  return `Choose extraction granularity for this Obsidian LLM Wiki ingest.

Return ONLY JSON:
{
  "granularity": "coarse|standard|fine|custom",
  "source_kind": "short label",
  "reason": "one short sentence",
  "customEntityLimit": 5,
  "customConceptLimit": 5
}

Guidance:
- coarse: clean semantic backbone, abstract idea notes, personal/daily notes, low-noise first pass.
- standard: technical playbooks, source notes with multiple reusable ideas/tools/workflows.
- fine: dense source where most sections contain page-worthy durable knowledge.
- custom: use only when a precise cap is better than a preset; include both custom limits.
- Prefer core meaning units over incidental nouns. Useful tools may be preserved as supporting anchors.
- Do not choose fine just because the source is long; choose it only when the long source is dense throughout.

Source profile:
${profile}`;
}

export async function resolveGranularityPreflight(input: PreflightInput): Promise<GranularityDecision | null> {
  if (input.settings.extractionGranularity !== 'auto') return null;

  try {
    const profile = buildPreflightProfile(input.sourcePath, input.basename, input.content);
    const response = await input.client.createMessage({
      model: input.settings.model,
      max_tokens: PREFLIGHT_MAX_TOKENS,
      messages: [{ role: 'user', content: buildPreflightPrompt(profile) }],
      response_format: { type: 'json_object' },
      maxTokensPerCall: input.settings.maxTokensPerCall,
      temperature: input.settings.extractionTemperature ?? 0.1,
    });
    return await parsePreflightDecision(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallbackDecision(`Auto preflight call failed: ${message.slice(0, 180)}`);
  }
}

export function applyGranularityDecision(
  settings: LLMWikiSettings,
  decision: GranularityDecision
): LLMWikiSettings {
  return {
    ...settings,
    extractionGranularity: decision.resolved,
    customEntityLimit: decision.resolved === 'custom' ? decision.customEntityLimit : settings.customEntityLimit,
    customConceptLimit: decision.resolved === 'custom' ? decision.customConceptLimit : settings.customConceptLimit,
  };
}

export function formatGranularityDecision(decision: GranularityDecision): string {
  const custom = decision.resolved === 'custom'
    ? ` (${decision.customEntityLimit}/${decision.customConceptLimit})`
    : '';
  return `Auto preflight: ${decision.resolved}${custom} - ${decision.source_kind}: ${decision.reason}`;
}
