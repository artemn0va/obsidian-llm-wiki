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
import type { QAReport } from './qa.js';

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

interface SnapshotLike {
  capturedAt?: string;
}

interface RunDiff {
  created?: unknown[];
  changed?: unknown[];
  deleted?: unknown[];
}

export interface RunSummary {
  id: string;
  modifiedAt: string;
  command: unknown;
  response: unknown;
  before: unknown;
  after: unknown;
  diff: RunDiff | null;
  qaBefore: QAReport | null;
  qaAfter: QAReport | null;
  sourcePath: string | null;
  commandType: string;
  mode: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  counts: {
    created: number;
    changed: number;
    deleted: number;
  };
}

export async function getRuns(): Promise<RunSummary[]> {
  const runsRoot = path.join(labStateRoot, 'runs');
  try {
    const entries = await fs.readdir(runsRoot, { withFileTypes: true });
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
          const qaBefore = await readJson<QAReport>(path.join(runPath, 'qa-before.json'));
          const qaAfter =
            await readJson<QAReport>(path.join(runPath, 'qa-after.json')) ??
            await readJson<QAReport>(path.join(runPath, 'qa.json'));
          const startedAt = response?.startedAt || before?.capturedAt || command?.createdAt || null;
          const completedAt = response?.completedAt || after?.capturedAt || null;

          return {
            id: entry.name,
            modifiedAt: stats.mtime.toISOString(),
            command,
            response,
            before,
            after,
            diff,
            qaBefore,
            qaAfter,
            sourcePath: command?.path || null,
            commandType: command?.type || 'unknown',
            mode: command?.granularity || command?.type || 'unknown',
            status: response?.status || 'queued',
            startedAt,
            completedAt,
            durationMs: startedAt && completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : null,
            counts: {
              created: diff?.created?.length || 0,
              changed: diff?.changed?.length || 0,
              deleted: diff?.deleted?.length || 0,
            },
          };
        }),
    );

    return runs.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch {
    return [];
  }
}
