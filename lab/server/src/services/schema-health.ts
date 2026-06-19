import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, forkRoot, labStateRoot } from '../config.js';
import { readJson } from './fs.js';

const TARGET_TASKS = ['analyze', 'summary', 'entity', 'concept', 'related', 'merge', 'full'] as const;
const IMPORTANT_SECTIONS = [
  'Language Policy',
  'Ingest Granularity Policy',
  'Domain Extraction Policy',
  'Source Page Template',
  'Naming Conventions',
  'Classification Rules',
  'Content Rules',
] as const;

type TargetTask = typeof TARGET_TASKS[number];

interface RuntimeStatus {
  settings?: {
    wikiLanguage?: string;
  } | null;
}

export interface SchemaTaskCoverage {
  task: TargetTask;
  configuredSections: string[];
  availableSections: string[];
  missingSections: string[];
  importantSectionsUsed: string[];
  coveragePercent: number;
}

export interface SchemaHealth {
  generatedAt: string;
  schemaPath: string;
  exists: boolean;
  modifiedAt: string | null;
  detectedSections: string[];
  requiredSections: string[];
  missingRequiredSections: string[];
  taskCoverage: SchemaTaskCoverage[];
  unusedImportantSections: string[];
  wikiLanguage: string | null;
  languagePolicy: {
    present: boolean;
    preview: string[];
  };
  warnings: string[];
}

export async function getSchemaHealth(): Promise<SchemaHealth> {
  const schemaPath = 'wiki/schema/config.md';
  const fullSchemaPath = path.join(activeVaultRoot, schemaPath);
  const runtimeStatus = await readJson<RuntimeStatus>(path.join(labStateRoot, 'runtime-status.json'));
  const taskSections = await readTaskSections();

  let content = '';
  let modifiedAt: string | null = null;
  let exists = false;

  try {
    const stats = await fs.stat(fullSchemaPath);
    content = await fs.readFile(fullSchemaPath, 'utf8');
    modifiedAt = stats.mtime.toISOString();
    exists = true;
  } catch {
    // Missing schema is reported through health warnings.
  }

  const sectionBodies = parseMarkdownSections(content);
  const detectedSections = [...sectionBodies.keys()];
  const detectedSet = new Set(detectedSections);
  const requiredSections = [...IMPORTANT_SECTIONS];
  const missingRequiredSections = requiredSections.filter((section) => !detectedSet.has(section));
  const taskCoverage = TARGET_TASKS.map((task) => buildTaskCoverage(task, taskSections[task] || [], detectedSet));
  const usedImportantSections = new Set(taskCoverage.flatMap((item) => item.importantSectionsUsed));
  const unusedImportantSections = requiredSections.filter((section) => detectedSet.has(section) && !usedImportantSections.has(section));
  const languagePolicyBody = sectionBodies.get('Language Policy') || '';
  const warnings = buildWarnings(exists, missingRequiredSections, taskCoverage, unusedImportantSections, runtimeStatus?.settings?.wikiLanguage || null);

  return {
    generatedAt: new Date().toISOString(),
    schemaPath,
    exists,
    modifiedAt,
    detectedSections,
    requiredSections,
    missingRequiredSections,
    taskCoverage,
    unusedImportantSections,
    wikiLanguage: runtimeStatus?.settings?.wikiLanguage || null,
    languagePolicy: {
      present: Boolean(languagePolicyBody),
      preview: previewSection(languagePolicyBody),
    },
    warnings,
  };
}

async function readTaskSections(): Promise<Record<string, string[]>> {
  const source = await fs.readFile(path.join(forkRoot, 'src', 'schema', 'schema-manager.ts'), 'utf8');
  const match = /const\s+TASK_SECTIONS[\s\S]*?=\s*\{([\s\S]*?)\};/.exec(source);
  if (!match) return {};

  const result: Record<string, string[]> = {};
  const entryRegex = /(\w+):\s*\[([\s\S]*?)\],?/g;
  let entry: RegExpExecArray | null;

  while ((entry = entryRegex.exec(match[1]))) {
    const [, task, rawSections] = entry;
    result[task] = [...rawSections.matchAll(/'([^']+)'/g)].map((section) => section[1]);
  }

  return result;
}

function parseMarkdownSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let current: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.set(current, buffer.join('\n').trim());
      current = heading[1].trim();
      buffer = [];
      continue;
    }

    if (current) buffer.push(line);
  }

  if (current) sections.set(current, buffer.join('\n').trim());
  return sections;
}

function buildTaskCoverage(task: TargetTask, configuredSections: string[], detectedSet: Set<string>): SchemaTaskCoverage {
  const availableSections = configuredSections.filter((section) => detectedSet.has(section));
  const missingSections = configuredSections.filter((section) => !detectedSet.has(section));
  const importantSectionsUsed = configuredSections.filter((section) => IMPORTANT_SECTIONS.includes(section as typeof IMPORTANT_SECTIONS[number]));
  const coveragePercent = configuredSections.length
    ? Math.round((availableSections.length / configuredSections.length) * 100)
    : 0;

  return {
    task,
    configuredSections,
    availableSections,
    missingSections,
    importantSectionsUsed,
    coveragePercent,
  };
}

function previewSection(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('<!--'))
    .slice(0, 5);
}

function buildWarnings(
  exists: boolean,
  missingRequiredSections: string[],
  taskCoverage: SchemaTaskCoverage[],
  unusedImportantSections: string[],
  wikiLanguage: string | null,
): string[] {
  const warnings: string[] = [];
  if (!exists) warnings.push('Active schema file is missing.');
  if (missingRequiredSections.length) warnings.push(`Missing required schema sections: ${missingRequiredSections.join(', ')}.`);
  const tasksWithMissing = taskCoverage.filter((task) => task.missingSections.length);
  if (tasksWithMissing.length) warnings.push(`${tasksWithMissing.length} task prompt route(s) reference sections missing from the schema file.`);
  if (unusedImportantSections.length) warnings.push(`Important sections are present but unused by target tasks: ${unusedImportantSections.join(', ')}.`);
  if (!wikiLanguage) warnings.push('Wiki language is unavailable until the plugin exports sanitized runtime settings.');
  return warnings;
}
