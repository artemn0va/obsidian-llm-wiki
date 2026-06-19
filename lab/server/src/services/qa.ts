import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, toPosix, wikiRoot } from '../config.js';
import { listMarkdownFiles, parseFrontmatter } from './fs.js';

export type QAFindingSeverity = 'error' | 'warning' | 'info';

export interface QAFinding {
  severity: QAFindingSeverity;
  file: string;
  line?: number;
  message: string;
  suggestedFix: string;
}

export interface QAReport {
  generatedAt: string;
  counts: Record<QAFindingSeverity, number>;
  findings: QAFinding[];
}

export interface QAFixChange {
  file: string;
  action: string;
  count: number;
}

export interface QAFixReport {
  generatedAt: string;
  applied: number;
  updatedFiles: string[];
  remainingFindings: number;
  changes: QAFixChange[];
}

export type QAFixIssueType =
  | 'broken-links'
  | 'prompt-leaks'
  | 'source_file'
  | 'bad-slug'
  | 'source-tag-pollution'
  | 'other';

export interface QAFixPreviewItem {
  id: string;
  type: QAFixIssueType;
  fixable: boolean;
  file: string;
  line?: number;
  severity: QAFindingSeverity;
  message: string;
  proposedChange: string;
  beforeSnippet?: string;
  afterSnippet?: string;
  explanation?: string;
}

export interface QAFixPreview {
  generatedAt: string;
  fixableCount: number;
  nonFixableCount: number;
  groups: Record<QAFixIssueType, QAFixPreviewItem[]>;
}

export async function runQA(): Promise<QAReport> {
  const files = await listMarkdownFiles(wikiRoot);
  const existingTargets = new Set<string>();
  const contents: Array<{ fullPath: string; relative: string; content: string }> = [];

  for (const fullPath of files) {
    const relative = toPosix(path.relative(activeVaultRoot, fullPath));
    const withoutExt = relative.replace(/\.md$/i, '');
    existingTargets.add(withoutExt);
    existingTargets.add(withoutExt.replace(/^wiki\//, ''));
    contents.push({ fullPath, relative, content: await fs.readFile(fullPath, 'utf8') });
  }

  const findings: QAFinding[] = [];
  for (const item of contents) {
    if (isSchemaDocument(item.relative)) continue;
    scanPromptLeakage(item, findings);
    scanSlugQuality(item, findings);
    scanBrokenLinks(item, existingTargets, findings);
    scanFrontmatter(item, findings);
    scanDuplicateQuotes(item, findings);
    scanThinPages(item, findings);
  }

  const counts = findings.reduce<Record<QAFindingSeverity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    counts,
    findings,
  };
}

export async function fixQA(): Promise<QAFixReport> {
  return applyQAFixes();
}

export async function previewQAFixes(): Promise<QAFixPreview> {
  const files = await listMarkdownFiles(wikiRoot);
  const existingTargets = await collectExistingTargets(files);
  const report = await runQA();
  const contentByFile = new Map<string, string>();

  for (const fullPath of files) {
    const relative = toPosix(path.relative(activeVaultRoot, fullPath));
    contentByFile.set(relative, await fs.readFile(fullPath, 'utf8'));
  }

  const groups = emptyFixGroups();
  for (const finding of report.findings) {
    const content = contentByFile.get(finding.file) || '';
    const item = buildFixPreviewItem(finding, content, existingTargets);
    groups[item.type].push(item);
  }

  const allItems = Object.values(groups).flat();
  return {
    generatedAt: new Date().toISOString(),
    fixableCount: allItems.filter((item) => item.fixable).length,
    nonFixableCount: allItems.filter((item) => !item.fixable).length,
    groups,
  };
}

export async function applyQAFixes(ids?: string[]): Promise<QAFixReport> {
  const files = await listMarkdownFiles(wikiRoot);
  const existingTargets = await collectExistingTargets(files);
  const selectedIds = ids?.length ? new Set(ids) : null;
  const preview = selectedIds ? await previewQAFixes() : null;
  const selectedItems = preview
    ? Object.values(preview.groups).flat().filter((item) => selectedIds?.has(item.id) && item.fixable)
    : [];
  const selectedByFile = new Map<string, QAFixPreviewItem[]>();

  for (const item of selectedItems) {
    const items = selectedByFile.get(item.file) || [];
    items.push(item);
    selectedByFile.set(item.file, items);
  }

  const changes: QAFixChange[] = [];
  const updatedFiles: string[] = [];

  for (const fullPath of files) {
    const relative = toPosix(path.relative(activeVaultRoot, fullPath));
    if (isSchemaDocument(relative)) continue;
    if (selectedIds && !selectedByFile.has(relative)) continue;

    const original = await fs.readFile(fullPath, 'utf8');
    let content = original;
    const selectedLinesByType = selectedIds ? linesByType(selectedByFile.get(relative) || []) : null;

    const linkFix = unwrapBrokenWikiLinks(content, existingTargets, selectedLinesByType?.get('broken-links'));
    content = linkFix.content;
    if (linkFix.count) {
      changes.push({ file: relative, action: 'Unwrapped broken wiki links into plain text.', count: linkFix.count });
    }

    const promptLeakFix = stripPromptArtifacts(content, selectedLinesByType?.get('prompt-leaks'));
    content = promptLeakFix.content;
    if (promptLeakFix.count) {
      changes.push({ file: relative, action: 'Removed prompt artifact lines.', count: promptLeakFix.count });
    }

    const frontmatterFix = fixLegacySourceFileFrontmatter(content, selectedLinesByType?.get('source_file'));
    content = frontmatterFix.content;
    if (frontmatterFix.count) {
      changes.push({ file: relative, action: 'Replaced legacy source_file frontmatter.', count: frontmatterFix.count });
    }

    if (content !== original) {
      await fs.writeFile(fullPath, content, 'utf8');
      updatedFiles.push(relative);
    }
  }

  const after = await runQA();
  const applied = changes.reduce((sum, change) => sum + change.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    applied,
    updatedFiles,
    remainingFindings: after.findings.length,
    changes,
  };
}

function emptyFixGroups(): Record<QAFixIssueType, QAFixPreviewItem[]> {
  return {
    'broken-links': [],
    'prompt-leaks': [],
    source_file: [],
    'bad-slug': [],
    'source-tag-pollution': [],
    other: [],
  };
}

function buildFixPreviewItem(
  finding: QAFinding,
  content: string,
  existingTargets: Set<string>,
): QAFixPreviewItem {
  const type = classifyFinding(finding);
  const base = {
    id: fixItemId(finding, type),
    type,
    file: finding.file,
    line: finding.line,
    severity: finding.severity,
    message: finding.message,
  };

  if (type === 'broken-links') {
    const before = lineSnippet(content, finding.line);
    const after = finding.line
      ? unwrapBrokenWikiLinks(content, existingTargets, new Set([finding.line])).content.split(/\r?\n/)[finding.line - 1]?.trim()
      : undefined;
    return {
      ...base,
      fixable: true,
      proposedChange: 'Replace the broken wiki link on this line with plain text. No new wiki page is created.',
      beforeSnippet: before,
      afterSnippet: after,
    };
  }

  if (type === 'prompt-leaks') {
    return {
      ...base,
      fixable: true,
      proposedChange: 'Remove the leaked prompt/schema instruction line from the generated page.',
      beforeSnippet: lineSnippet(content, finding.line),
      afterSnippet: '',
    };
  }

  if (type === 'source_file') {
    const preview = fixLegacySourceFileFrontmatter(content, finding.line ? new Set([finding.line]) : undefined);
    return {
      ...base,
      fixable: true,
      proposedChange: 'Replace legacy source_file frontmatter with source_path, or remove it when source_path already exists.',
      beforeSnippet: lineSnippet(content, finding.line) || 'source_file:',
      afterSnippet: preview.content !== content ? frontmatterSnippet(preview.content) : 'source_path:',
    };
  }

  if (type === 'bad-slug') {
    return {
      ...base,
      fixable: false,
      proposedChange: 'Manual review required.',
      explanation: 'Renaming a slug requires moving the file and updating inbound links, so it is not applied automatically.',
    };
  }

  if (type === 'source-tag-pollution') {
    return {
      ...base,
      fixable: false,
      proposedChange: 'Manual review required.',
      explanation: 'Source tags can only be safely removed when the original source frontmatter is known.',
    };
  }

  return {
    ...base,
    fixable: false,
    proposedChange: 'Manual review required.',
    explanation: 'This finding needs semantic judgment or content review.',
  };
}

function classifyFinding(finding: QAFinding): QAFixIssueType {
  const text = `${finding.message} ${finding.suggestedFix}`.toLowerCase();
  if (text.includes('broken wiki link') || text.includes('raw source path')) return 'broken-links';
  if (text.includes('prompt artifact') || text.includes('active tag vocabulary') || text.includes('begin schema') || text.includes('validator')) return 'prompt-leaks';
  if (text.includes('source_file')) return 'source_file';
  if (text.includes('bad slug') || text.includes('non-ascii')) return 'bad-slug';
  if (text.includes('source tag')) return 'source-tag-pollution';
  return 'other';
}

function fixItemId(finding: QAFinding, type: QAFixIssueType): string {
  return Buffer.from(`${type}|${finding.file}|${finding.line || 0}|${finding.message}`).toString('base64url');
}

function linesByType(items: QAFixPreviewItem[]): Map<QAFixIssueType, Set<number>> {
  const result = new Map<QAFixIssueType, Set<number>>();
  for (const item of items) {
    if (!item.line) continue;
    const lines = result.get(item.type) || new Set<number>();
    lines.add(item.line);
    result.set(item.type, lines);
  }
  return result;
}

async function collectExistingTargets(files: string[]): Promise<Set<string>> {
  const existingTargets = new Set<string>();

  for (const fullPath of files) {
    const relative = toPosix(path.relative(activeVaultRoot, fullPath));
    const withoutExt = relative.replace(/\.md$/i, '');
    existingTargets.add(withoutExt);
    existingTargets.add(withoutExt.replace(/^wiki\//, ''));
  }

  return existingTargets;
}

function isSchemaDocument(relativePath: string): boolean {
  return relativePath.startsWith('wiki/schema/') || relativePath === 'wiki/concepts/llm-wiki-schema.md';
}

function scanPromptLeakage(item: { relative: string; content: string }, findings: QAFinding[]): void {
  for (const phrase of ['Active Tag Vocabulary', 'BEGIN SCHEMA', 'validator instructions']) {
    const line = lineOf(item.content, phrase);
    if (line) {
      findings.push({
        severity: 'error',
        file: item.relative,
        line,
        message: `Prompt artifact leaked into generated page: ${phrase}`,
        suggestedFix: 'Regenerate after prompt cleanup or strip this artifact before writing.',
      });
    }
  }

  const sourceFileLine = lineOf(item.content, 'source_file:');
  if (sourceFileLine) {
    findings.push({
      severity: 'error',
      file: item.relative,
      line: sourceFileLine,
      message: 'Legacy source_file frontmatter is present.',
      suggestedFix: 'Use source_path on source pages and sources arrays elsewhere.',
    });
  }
}

function unwrapBrokenWikiLinks(content: string, existingTargets: Set<string>, allowedLines?: Set<number>): { content: string; count: number } {
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
  let count = 0;
  const nextContent = content.replace(linkRegex, (match: string, rawTarget: string, label: string | undefined, offset: number) => {
    const line = lineOfOffset(content, offset);
    if (allowedLines && !allowedLines.has(line)) return match;

    const target = rawTarget.trim();
    if (!target || target.startsWith('http')) return match;

    const normalized = toPosix(path.normalize(target)).replace(/\.md$/i, '');
    const rawSourcePath = normalized.startsWith('sources/') && normalized.split('/').length > 2;
    const missingTarget = !existingTargets.has(normalized) && !existingTargets.has(`wiki/${normalized}`);

    if (!rawSourcePath && !missingTarget) return match;

    count += 1;
    return (label || target).trim();
  });

  return { content: nextContent, count };
}

function stripPromptArtifacts(content: string, allowedLines?: Set<number>): { content: string; count: number } {
  const phrases = ['Active Tag Vocabulary', 'BEGIN SCHEMA', 'validator instructions'];
  let count = 0;
  const lines = content.split(/\r?\n/);
  const nextLines = lines.filter((line, index) => {
    const lineNumber = index + 1;
    if (allowedLines && !allowedLines.has(lineNumber)) return true;
    const shouldRemove = phrases.some((phrase) => line.includes(phrase));
    if (shouldRemove) count += 1;
    return !shouldRemove;
  });

  return { content: nextLines.join('\n'), count };
}

function fixLegacySourceFileFrontmatter(content: string, allowedLines?: Set<number>): { content: string; count: number } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { content, count: 0 };

  const frontmatter = match[1];
  if (!/^source_file:/m.test(frontmatter)) return { content, count: 0 };

  let count = 0;
  let nextFrontmatter: string;
  const frontmatterStart = match.index ?? 0;

  if (/^source_path:/m.test(frontmatter)) {
    nextFrontmatter = frontmatter.replace(/^source_file:.*(?:\r?\n)?/gm, (line: string, offset: number) => {
      const lineNumber = lineOfOffset(content, frontmatterStart + 4 + offset);
      if (allowedLines && !allowedLines.has(lineNumber)) return line;
      count += 1;
      return '';
    });
  } else {
    nextFrontmatter = frontmatter.replace(/^source_file:/gm, (line: string, offset: number) => {
      const lineNumber = lineOfOffset(content, frontmatterStart + 4 + offset);
      if (allowedLines && !allowedLines.has(lineNumber)) return line;
      count += 1;
      return 'source_path:';
    });
  }

  return {
    content: content.replace(match[0], `---\n${nextFrontmatter.trimEnd()}\n---`),
    count,
  };
}

function lineSnippet(content: string, line?: number): string | undefined {
  if (!line) return undefined;
  return content.split(/\r?\n/)[line - 1]?.trim();
}

function frontmatterSnippet(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1]?.split(/\r?\n/).slice(0, 8).join('\n') || '';
}

function scanSlugQuality(item: { relative: string }, findings: QAFinding[]): void {
  const basename = path.basename(item.relative);
  if (basename.includes('#-')) {
    findings.push({
      severity: 'error',
      file: item.relative,
      message: 'Bad slug contains "#-".',
      suggestedFix: 'Ensure # is stripped before slug generation.',
    });
  }

  if (/[^ -~]/.test(item.relative) && !item.relative.includes('schema/')) {
    findings.push({
      severity: 'warning',
      file: item.relative,
      message: 'Generated wiki path contains non-ASCII characters.',
      suggestedFix: 'Generated titles/slugs should be English unless preserving a proper name.',
    });
  }
}

function scanBrokenLinks(
  item: { relative: string; content: string },
  existingTargets: Set<string>,
  findings: QAFinding[],
): void {
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(item.content))) {
    const rawTarget = match[1].trim();
    if (!rawTarget || rawTarget.startsWith('http')) continue;
    const normalized = toPosix(path.normalize(rawTarget)).replace(/\.md$/i, '');
    const line = lineOfOffset(item.content, match.index);

    if (normalized.startsWith('sources/') && normalized.split('/').length > 2) {
      findings.push({
        severity: 'error',
        file: item.relative,
        line,
        message: `Raw source path was used as a wiki link: ${rawTarget}`,
        suggestedFix: 'Use the generated source page path or plain source_path text.',
      });
      continue;
    }

    if (!existingTargets.has(normalized) && !existingTargets.has(`wiki/${normalized}`)) {
      findings.push({
        severity: 'error',
        file: item.relative,
        line,
        message: `Broken wiki link: ${rawTarget}`,
        suggestedFix: 'Link only to existing pages or pages created in the same ingest.',
      });
    }
  }
}

function scanFrontmatter(item: { relative: string; content: string }, findings: QAFinding[]): void {
  const frontmatter = parseFrontmatter(item.content);
  const type = String(frontmatter.type || '');

  if ((type === 'entity' || type === 'concept') && !Array.isArray(frontmatter.sources)) {
    findings.push({
      severity: 'warning',
      file: item.relative,
      message: 'Entity/concept page has no sources array.',
      suggestedFix: 'Regenerate or add source-backed attribution.',
    });
  }

  if (type === 'source' && item.content.includes('source_file:')) {
    findings.push({
      severity: 'error',
      file: item.relative,
      message: 'Source page uses source_file instead of source_path.',
      suggestedFix: 'Regenerate source page with current source template.',
    });
  }
}

function scanDuplicateQuotes(item: { relative: string; content: string }, findings: QAFinding[]): void {
  const quoteLines = item.content
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((entry) => entry.line.startsWith('>'));
  const seen = new Map<string, number>();

  for (const entry of quoteLines) {
    const previous = seen.get(entry.line);
    if (previous) {
      findings.push({
        severity: 'warning',
        file: item.relative,
        line: entry.number,
        message: `Duplicate quote also appears on line ${previous}.`,
        suggestedFix: 'Keep one quote and merge nearby interpretation.',
      });
    } else {
      seen.set(entry.line, entry.number);
    }
  }
}

function scanThinPages(item: { relative: string; content: string }, findings: QAFinding[]): void {
  if (!item.relative.includes('/entities/') && !item.relative.includes('/concepts/')) return;
  const body = item.content.replace(/^---[\s\S]*?\n---/, '');
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 0 && words < 80) {
    findings.push({
      severity: 'info',
      file: item.relative,
      message: 'Generated page is very thin.',
      suggestedFix: 'Consider merging or lowering extraction granularity.',
    });
  }
}

function lineOf(content: string, phrase: string): number | undefined {
  const index = content.indexOf(phrase);
  return index >= 0 ? lineOfOffset(content, index) : undefined;
}

function lineOfOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}
