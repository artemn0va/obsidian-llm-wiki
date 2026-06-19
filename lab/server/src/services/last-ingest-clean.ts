import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, labStateRoot, toPosix, wikiRoot } from '../config.js';
import { ensureDir, hashFile, listMarkdownFiles, readJson, writeJson } from './fs.js';
import type { WikiBackupManifest, WikiSnapshot } from './bridge.js';

interface IngestCommand {
  id: string;
  type: string;
  path?: string;
  createdAt?: string;
}

interface SnapshotFile {
  path: string;
  size?: number;
  modifiedAt?: string;
  sha256?: string | null;
}

interface WikiDiff {
  created?: SnapshotFile[];
  changed?: SnapshotFile[];
  deleted?: SnapshotFile[];
}

export interface CleanLastIngestResult {
  runId: string;
  commandPath?: string;
  mode: 'diff' | 'current-vs-before';
  deleted: string[];
  skipped: Array<{ path: string; reason: string }>;
  restoredChanged: string[];
  preservedChanged: string[];
}

export interface CleanLastIngestPreview {
  runId: string;
  commandPath?: string;
  mode: 'diff' | 'current-vs-before';
  deleteCandidates: string[];
  restoreCandidates: string[];
  skipped: Array<{ path: string; reason: string }>;
  preservedChanged: string[];
}

interface RestoreAction {
  path: string;
  backupPath: string;
}

interface RollbackPlan extends CleanLastIngestPreview {
  restoreActions: RestoreAction[];
}

const protectedWikiFiles = new Set([
  'wiki/index.md',
  'wiki/log.md',
  'wiki/schema/config.md',
  'wiki/concepts/llm-wiki-schema.md',
]);

const protectedRestoreFiles = new Set([
  'wiki/schema/config.md',
  'wiki/concepts/llm-wiki-schema.md',
]);

export async function cleanLastIngest(): Promise<CleanLastIngestResult> {
  const plan = await previewCleanLastIngest();
  const deleted: string[] = [];
  const restoredChanged: string[] = [];
  const skipped: CleanLastIngestResult['skipped'] = [...plan.skipped];

  for (const safeRelative of plan.deleteCandidates) {
    const fullPath = assertInside(wikiRoot, path.join(activeVaultRoot, safeRelative));
    try {
      await fs.rm(fullPath, { force: true });
      deleted.push(safeRelative);
    } catch (error) {
      skipped.push({ path: safeRelative, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const action of plan.restoreActions) {
    const fullPath = assertInside(wikiRoot, path.join(activeVaultRoot, action.path));
    try {
      await ensureDir(path.dirname(fullPath));
      await fs.copyFile(action.backupPath, fullPath);
      restoredChanged.push(action.path);
    } catch (error) {
      skipped.push({ path: action.path, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  await pruneEmptyWikiDirs(wikiRoot);
  const runRoot = path.join(labStateRoot, 'runs', plan.runId);
  await writeJson(path.join(runRoot, 'clean-last-ingest.json'), {
    generatedAt: new Date().toISOString(),
    mode: plan.mode,
    deleted,
    skipped,
    restoredChanged,
    preservedChanged: plan.preservedChanged,
  });

  return {
    runId: plan.runId,
    commandPath: plan.commandPath,
    mode: plan.mode,
    deleted,
    skipped,
    restoredChanged,
    preservedChanged: plan.preservedChanged,
  };
}

export async function previewCleanLastIngest(): Promise<RollbackPlan> {
  const run = await findLatestIngestRun();
  if (!run) {
    throw new Error('No Lab-tracked ingest run found.');
  }

  const diff = await readJson<WikiDiff>(path.join(run.runRoot, 'diff.json'));
  const before = await readJson<WikiSnapshot>(path.join(run.runRoot, 'before.json'));
  if (!before) {
    throw new Error(`Last ingest run has no before snapshot: ${run.command.id}`);
  }

  const mode: CleanLastIngestResult['mode'] = diff ? 'diff' : 'current-vs-before';
  const created = diff?.created || await createdSinceSnapshot(before);
  const changed = diff?.changed || [];
  const backupManifest = await readJson<WikiBackupManifest>(path.join(run.runRoot, 'backups', 'manifest.json'));
  const deleteCandidates: string[] = [];
  const restoreActions: RestoreAction[] = [];
  const preservedChanged: string[] = [];
  const skipped: CleanLastIngestResult['skipped'] = [];

  for (const file of created) {
    const safeRelative = normalizeDeletableWikiFile(file.path);
    if (!safeRelative) {
      skipped.push({ path: file.path, reason: 'Not a deletable generated wiki markdown file.' });
      continue;
    }

    deleteCandidates.push(safeRelative);
  }

  for (const file of changed) {
    const safeRelative = normalizeRestorableWikiFile(file.path);
    if (!safeRelative) {
      skipped.push({ path: file.path, reason: 'Not a restorable generated wiki markdown file.' });
      continue;
    }

    if (!backupManifest) {
      preservedChanged.push(safeRelative);
      skipped.push({ path: safeRelative, reason: 'No backup manifest exists for this run.' });
      continue;
    }

    const backup = backupManifest.files.find((item) => item.path === safeRelative);
    if (!backup) {
      preservedChanged.push(safeRelative);
      skipped.push({ path: safeRelative, reason: 'No backup exists for this changed file.' });
      continue;
    }

    const fullPath = assertInside(wikiRoot, path.join(activeVaultRoot, safeRelative));
    const currentHash = await hashFile(fullPath);
    if (currentHash !== file.sha256) {
      preservedChanged.push(safeRelative);
      skipped.push({ path: safeRelative, reason: 'Current file changed after ingest; refusing to overwrite.' });
      continue;
    }

    const backupPath = assertInside(run.runRoot, path.join(run.runRoot, backup.backupPath));
    const backupHash = await hashFile(backupPath);
    if (backupHash !== backup.sha256) {
      preservedChanged.push(safeRelative);
      skipped.push({ path: safeRelative, reason: 'Backup hash does not match before snapshot.' });
      continue;
    }

    restoreActions.push({ path: safeRelative, backupPath });
  }

  return {
    runId: run.command.id,
    commandPath: run.command.path,
    mode,
    deleteCandidates,
    skipped,
    restoreCandidates: restoreActions.map((action) => action.path),
    preservedChanged,
    restoreActions,
  };
}

async function findLatestIngestRun(): Promise<{ runRoot: string; command: IngestCommand } | null> {
  const runsRoot = path.join(labStateRoot, 'runs');
  const entries = await fs.readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const runRoot = path.join(runsRoot, entry.name);
        const command = await readJson<IngestCommand>(path.join(runRoot, 'command.json'));
        const stats = await fs.stat(runRoot).catch(() => null);
        return { runRoot, command, modifiedAt: stats?.mtime.toISOString() || '' };
      }),
  );

  return runs
    .filter((run): run is { runRoot: string; command: IngestCommand; modifiedAt: string } =>
      Boolean(run.command && (run.command.type === 'ingest-file' || run.command.type === 'ingest-folder')),
    )
    .sort((a, b) => (b.command.createdAt || b.modifiedAt).localeCompare(a.command.createdAt || a.modifiedAt))[0] || null;
}

async function createdSinceSnapshot(before: WikiSnapshot): Promise<SnapshotFile[]> {
  const beforePaths = new Set(before.files.map((file) => file.path));
  const currentFiles = await listMarkdownFiles(wikiRoot);

  return currentFiles
    .map((fullPath) => toPosix(path.relative(activeVaultRoot, fullPath)))
    .filter((relativePath) => !beforePaths.has(relativePath))
    .map((relativePath) => ({ path: relativePath }));
}

function normalizeDeletableWikiFile(relativePath: string): string | null {
  const normalized = toPosix(path.normalize(relativePath)).replace(/^\/+/, '');
  const lowered = normalized.toLowerCase();

  if (!lowered.startsWith('wiki/') || !lowered.endsWith('.md') || normalized.includes('../')) return null;
  if (protectedWikiFiles.has(normalized)) return null;
  if (lowered.startsWith('wiki/schema/')) return null;

  return normalized;
}

function normalizeRestorableWikiFile(relativePath: string): string | null {
  const normalized = toPosix(path.normalize(relativePath)).replace(/^\/+/, '');
  const lowered = normalized.toLowerCase();

  if (!lowered.startsWith('wiki/') || !lowered.endsWith('.md') || normalized.includes('../')) return null;
  if (protectedRestoreFiles.has(normalized)) return null;
  if (lowered.startsWith('wiki/schema/')) return null;

  return normalized;
}

async function pruneEmptyWikiDirs(root: string): Promise<boolean> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  let empty = true;

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const childEmpty = await pruneEmptyWikiDirs(fullPath);
      if (childEmpty && fullPath !== wikiRoot) {
        await fs.rmdir(fullPath).catch(() => undefined);
      } else {
        empty = false;
      }
    } else {
      empty = false;
    }
  }

  return empty;
}
