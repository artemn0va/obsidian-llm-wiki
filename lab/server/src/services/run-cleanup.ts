import fs from 'node:fs/promises';
import path from 'node:path';
import { labStateRoot } from '../config.js';
import { getRuns } from './status.js';

export interface StaleRunCleanupResult {
  deleted: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export async function cleanupStaleRuns(ids?: string[]): Promise<StaleRunCleanupResult> {
  const requestedIds = ids?.length ? new Set(ids) : null;
  const runs = await getRuns();
  const deleted: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const run of runs) {
    if (requestedIds && !requestedIds.has(run.id)) continue;

    if (!run.canCleanup || !run.isStale) {
      skipped.push({ id: run.id, reason: run.staleReason || 'Run is not stale.' });
      continue;
    }

    await removeRunArtifacts(run.id);
    deleted.push(run.id);
  }

  if (requestedIds) {
    for (const id of requestedIds) {
      if (!runs.some((run) => run.id === id)) {
        skipped.push({ id, reason: 'Run not found.' });
      }
    }
  }

  return { deleted, skipped };
}

async function removeRunArtifacts(runId: string): Promise<void> {
  const runsRoot = path.join(labStateRoot, 'runs');
  const commandsRoot = path.join(labStateRoot, 'commands');
  const responsesRoot = path.join(labStateRoot, 'responses');

  await fs.rm(path.join(runsRoot, runId), { recursive: true, force: true });
  await fs.rm(path.join(commandsRoot, `${runId}.json`), { force: true });
  await fs.rm(path.join(responsesRoot, `${runId}.json`), { force: true });
}
