import fs from 'node:fs/promises';
import path from 'node:path';
import {
  activeVaultRoot,
  forkRoot,
  labStateRoot,
  pluginInstallRoot,
  resetScriptPath,
  webDistRoot,
  wikiRoot,
} from '../config.js';
import { getWikiFiles, hashFile, pathExists, readJson } from './fs.js';
import { scoreIngestQuality, type IngestQualityScore } from './quality-score.js';
import type { QAReport } from './qa.js';
import { getRunReview, type RunReviewState } from './run-review.js';

export interface LabStatus {
  activeVaultRoot: string;
  forkRoot: string;
  wikiRoot: string;
  pluginInstallRoot: string;
  resetScriptExists: boolean;
  webBuildExists: boolean;
  wikiCounts: Record<string, number>;
  plugin: {
    installed: boolean;
    version: string | null;
    forkMainHash: string | null;
    installedMainHash: string | null;
    hashMatch: boolean;
  };
  bridge: {
    stateRoot: string;
    runtimeStatus: unknown;
  };
}

export async function getStatus(): Promise<LabStatus> {
  const wikiFiles = await getWikiFiles();
  const wikiCounts = wikiFiles.reduce<Record<string, number>>((counts, file) => {
    counts[file.type] = (counts[file.type] || 0) + 1;
    return counts;
  }, {});

  const manifest = await readJson<{ version?: string }>(path.join(pluginInstallRoot, 'manifest.json'));
  const forkMainHash = await hashFile(path.join(forkRoot, 'main.js'));
  const installedMainHash = await hashFile(path.join(pluginInstallRoot, 'main.js'));
  const runtimeStatus = await readJson(path.join(labStateRoot, 'runtime-status.json'));

  return {
    activeVaultRoot,
    forkRoot,
    wikiRoot,
    pluginInstallRoot,
    resetScriptExists: await pathExists(resetScriptPath),
    webBuildExists: await pathExists(webDistRoot),
    wikiCounts,
    plugin: {
      installed: await pathExists(pluginInstallRoot),
      version: manifest?.version ?? null,
      forkMainHash,
      installedMainHash,
      hashMatch: Boolean(forkMainHash && installedMainHash && forkMainHash === installedMainHash),
    },
    bridge: {
      stateRoot: labStateRoot,
      runtimeStatus,
    },
  };
}

interface RunCommand {
  id?: string;
  type?: string;
  path?: string;
  createdAt?: string;
  granularity?: string;
}

interface RunResponse {
  status?: string;
  message?: string;
  progress?: unknown;
  startedAt?: string;
  completedAt?: string;
}

interface RuntimeStatus {
  busy?: boolean;
  running?: boolean;
  updatedAt?: string;
  activeCommand?: {
    id?: string;
  } | null;
}

interface SnapshotLike {
  capturedAt?: string;
  files?: Array<{ path: string }>;
}

interface RunDiff {
  created?: unknown[];
  changed?: unknown[];
  deleted?: unknown[];
  preserved?: unknown[];
}

export interface RunSummary {
  id: string;
  modifiedAt: string;
  command: unknown;
  response: unknown;
  before: unknown;
  after: unknown;
  diff: RunDiff | null;
  review: RunReviewState | null;
  qaBefore: QAReport | null;
  qaAfter: QAReport | null;
  quality: IngestQualityScore;
  sourcePath: string | null;
  commandType: string;
  mode: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  isStale: boolean;
  staleReason: string | null;
  canCleanup: boolean;
  counts: {
    created: number;
    changed: number;
    deleted: number;
  };
}

export const STALE_RUN_MS = 10 * 60 * 1000;
const terminalRunStatuses = new Set(['success', 'error', 'cancelled']);

export async function getRuns(): Promise<RunSummary[]> {
  const runsRoot = path.join(labStateRoot, 'runs');
  try {
    const entries = await fs.readdir(runsRoot, { withFileTypes: true });
    const runtimeStatus = await readJson<RuntimeStatus>(path.join(labStateRoot, 'runtime-status.json'));
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const runPath = path.join(runsRoot, entry.name);
          const stats = await fs.stat(runPath);
          const command = await readJson<RunCommand>(path.join(runPath, 'command.json'));
          const response =
            await readJson<RunResponse>(path.join(runPath, 'response.json')) ??
            await readJson<RunResponse>(path.join(labStateRoot, 'responses', `${entry.name}.json`));
          const before = await readJson<SnapshotLike>(path.join(runPath, 'before.json'));
          const after = await readJson<SnapshotLike>(path.join(runPath, 'after.json'));
          const diff = await readJson<RunDiff>(path.join(runPath, 'diff.json'));
          const review = await getRunReview(entry.name);
          const qaBefore = await readJson<QAReport>(path.join(runPath, 'qa-before.json'));
          const qaAfter =
            await readJson<QAReport>(path.join(runPath, 'qa-after.json')) ??
            await readJson<QAReport>(path.join(runPath, 'qa.json'));
          const fullDiff = diff ? { ...diff, preserved: preservedFiles(before, after, diff) } : null;
          const startedAt = response?.startedAt || before?.capturedAt || command?.createdAt || null;
          const completedAt = response?.completedAt || after?.capturedAt || null;
          const status = response?.status || 'queued';
          const staleInfo = getRunStaleInfo({
            id: entry.name,
            status,
            modifiedAt: stats.mtime.toISOString(),
            response,
            command,
            runtimeStatus,
          });

          return {
            id: entry.name,
            modifiedAt: stats.mtime.toISOString(),
            command,
            response,
            before,
            after,
            diff: fullDiff,
            review,
            qaBefore,
            qaAfter,
            quality: scoreIngestQuality(qaAfter),
            sourcePath: command?.path || null,
            commandType: command?.type || 'unknown',
            mode: command?.granularity || command?.type || 'unknown',
            status,
            startedAt,
            completedAt,
            durationMs: startedAt && completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : null,
            isStale: staleInfo.isStale,
            staleReason: staleInfo.reason,
            canCleanup: staleInfo.canCleanup,
            counts: {
              created: fullDiff?.created?.length || 0,
              changed: fullDiff?.changed?.length || 0,
              deleted: fullDiff?.deleted?.length || 0,
            },
          };
        }),
    );

    return runs.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch {
    return [];
  }
}

export function getRunStaleInfo(input: {
  id: string;
  status: string;
  modifiedAt: string;
  response?: RunResponse | null;
  command?: RunCommand | null;
  runtimeStatus?: RuntimeStatus | null;
}): { isStale: boolean; reason: string | null; canCleanup: boolean } {
  if (terminalRunStatuses.has(input.status)) {
    return { isStale: false, reason: null, canCleanup: false };
  }

  const now = Date.now();
  const lastTouchedAt = latestTimestamp([
    input.modifiedAt,
    input.response?.completedAt,
    input.response?.startedAt,
    progressUpdatedAt(input.response?.progress),
    input.command?.createdAt,
  ]);
  const ageMs = lastTouchedAt ? now - lastTouchedAt : Number.POSITIVE_INFINITY;
  const activeCommandId = input.runtimeStatus?.activeCommand?.id;
  const runtimeUpdatedAt = input.runtimeStatus?.updatedAt ? new Date(input.runtimeStatus.updatedAt).getTime() : 0;
  const runtimeFresh = runtimeUpdatedAt > 0 && now - runtimeUpdatedAt <= STALE_RUN_MS;

  if (activeCommandId === input.id && runtimeFresh && input.runtimeStatus?.busy) {
    return { isStale: false, reason: null, canCleanup: false };
  }

  if (ageMs <= STALE_RUN_MS) {
    return { isStale: false, reason: null, canCleanup: false };
  }

  const minutes = Math.max(1, Math.round(ageMs / 60000));
  const reason = activeCommandId === input.id
    ? `Active bridge command has no fresh heartbeat for ${minutes} min.`
    : `Unfinished run has no update for ${minutes} min.`;

  return { isStale: true, reason, canCleanup: true };
}

function latestTimestamp(values: Array<string | undefined | null>): number | null {
  const timestamps = values
    .map((value) => value ? new Date(value).getTime() : NaN)
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) return null;
  return Math.max(...timestamps);
}

function progressUpdatedAt(progress: unknown): string | null {
  if (progress && typeof progress === 'object' && typeof (progress as { updatedAt?: unknown }).updatedAt === 'string') {
    return (progress as { updatedAt: string }).updatedAt;
  }

  return null;
}

function preservedFiles(before: SnapshotLike | null, after: SnapshotLike | null, diff: RunDiff) {
  if (!before?.files || !after?.files) return [];
  const afterPaths = new Set(after.files.map((file) => file.path));
  const changedPaths = new Set((diff.changed || []).map((file) => pathFromDiffFile(file)).filter(Boolean));
  const deletedPaths = new Set((diff.deleted || []).map((file) => pathFromDiffFile(file)).filter(Boolean));

  return before.files.filter((file) =>
    afterPaths.has(file.path) &&
    !changedPaths.has(file.path) &&
    !deletedPaths.has(file.path),
  );
}

function pathFromDiffFile(value: unknown) {
  if (value && typeof value === 'object' && typeof (value as { path?: unknown }).path === 'string') {
    return (value as { path: string }).path;
  }

  return null;
}
