import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { labStateRoot } from '../config.js';
import { ensureDir, readJson, writeJson } from './fs.js';

export const BRIDGE_STALE_MS = 10 * 60 * 1000;

type BridgeQueueState = 'pending' | 'running' | 'stale' | 'failed' | 'done';

interface BridgeCommandFile {
  id?: string;
  type?: string;
  path?: string;
  createdAt?: string;
  source?: string;
}

interface BridgeResponseFile {
  id?: string;
  type?: string;
  status?: string;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  completedAt?: string;
  progress?: {
    updatedAt?: string;
  } | null;
}

interface RuntimeStatus {
  enabled?: boolean;
  running?: boolean;
  busy?: boolean;
  updatedAt?: string;
  message?: string;
  activeCommand?: {
    id?: string;
    type?: string;
    path?: string;
    createdAt?: string;
  } | null;
}

export interface BridgeQueueItem {
  id: string;
  type: string;
  path: string | null;
  state: BridgeQueueState;
  reason: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastHeartbeatAt: string | null;
  ageMs: number | null;
  commandFile: string | null;
  responseStatus: string | null;
  canClearStale: boolean;
  canCancel: boolean;
}

export interface BridgeQueueStatus {
  generatedAt: string;
  staleThresholdMs: number;
  activeCommandAgeMs: number | null;
  lastHeartbeatAt: string | null;
  disabledReason: string | null;
  warnings: string[];
  counts: Record<BridgeQueueState, number>;
  items: BridgeQueueItem[];
}

export interface BridgeQueueActionResult {
  cleared: string[];
  skipped: Array<{ id: string; reason: string }>;
}

const terminalStatuses = new Set(['success', 'cancelled']);
const failedStatuses = new Set(['error', 'failed']);

export async function getBridgeQueueStatus(runtimeStatus?: RuntimeStatus | null): Promise<BridgeQueueStatus> {
  const resolvedRuntimeStatus = runtimeStatus === undefined
    ? await readJson<RuntimeStatus>(path.join(labStateRoot, 'runtime-status.json'))
    : runtimeStatus;
  const [commands, responses] = await Promise.all([
    readCommandFiles(),
    readResponseFiles(),
  ]);
  const now = Date.now();
  const ids = new Set([...commands.keys(), ...responses.keys()]);
  const items = [...ids]
    .map((id) => buildQueueItem(id, commands.get(id) || null, responses.get(id) || null, resolvedRuntimeStatus || null, now))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const counts = emptyCounts();

  for (const item of items) {
    counts[item.state] += 1;
  }

  const lastHeartbeatAt = resolvedRuntimeStatus?.updatedAt || null;
  const activeCommandAgeMs = resolvedRuntimeStatus?.activeCommand?.createdAt
    ? Math.max(0, now - new Date(resolvedRuntimeStatus.activeCommand.createdAt).getTime())
    : null;
  const disabledReason = getDisabledReason(resolvedRuntimeStatus || null, now);
  const warnings = buildWarnings(resolvedRuntimeStatus || null, items, disabledReason, now);

  return {
    generatedAt: new Date(now).toISOString(),
    staleThresholdMs: BRIDGE_STALE_MS,
    activeCommandAgeMs,
    lastHeartbeatAt,
    disabledReason,
    warnings,
    counts,
    items,
  };
}

export async function clearStaleBridgeCommands(ids?: string[]): Promise<BridgeQueueActionResult> {
  const runtimeStatus = await readJson<RuntimeStatus>(path.join(labStateRoot, 'runtime-status.json'));
  const queue = await getBridgeQueueStatus(runtimeStatus);
  const requested = ids?.length ? new Set(ids) : null;
  const cleared: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const item of queue.items) {
    if (requested && !requested.has(item.id)) continue;
    if (!item.canClearStale) {
      skipped.push({ id: item.id, reason: item.reason || 'Command is not clearable.' });
      continue;
    }

    await fs.rm(path.join(commandsRoot(), `${item.id}.json`), { force: true });
    await writeJson(path.join(responsesRoot(), `${item.id}.json`), {
      id: item.id,
      type: item.type,
      status: 'cancelled',
      message: 'Stale command cleared by Wiki Lab. Run history was preserved.',
      finishedAt: new Date().toISOString(),
    });
    cleared.push(item.id);
  }

  if (requested) {
    for (const id of requested) {
      if (!queue.items.some((item) => item.id === id)) {
        skipped.push({ id, reason: 'Command not found.' });
      }
    }
  }

  return { cleared, skipped };
}

export async function requestActiveBridgeCancel(): Promise<{ queued: boolean; commandId: string | null; reason: string }> {
  const runtimeStatus = await readJson<RuntimeStatus>(path.join(labStateRoot, 'runtime-status.json'));
  if (!runtimeStatus?.enabled) {
    return { queued: false, commandId: null, reason: 'Lab Bridge is disabled.' };
  }

  if (!runtimeStatus.busy || !runtimeStatus.activeCommand?.id) {
    return { queued: false, commandId: null, reason: 'No active bridge command is running.' };
  }

  const id = crypto.randomUUID();
  const command = {
    id,
    type: 'cancel',
    createdAt: new Date().toISOString(),
    source: 'wiki-lab-ui',
    targetCommandId: runtimeStatus.activeCommand.id,
  };

  await ensureDir(commandsRoot());
  await writeJson(path.join(commandsRoot(), `${id}.json`), command);
  return { queued: true, commandId: id, reason: `Cancel requested for ${runtimeStatus.activeCommand.id}.` };
}

function buildQueueItem(
  id: string,
  commandEntry: { file: string; command: BridgeCommandFile } | null,
  responseEntry: { response: BridgeResponseFile } | null,
  runtimeStatus: RuntimeStatus | null,
  now: number,
): BridgeQueueItem {
  const command = commandEntry?.command || {};
  const response = responseEntry?.response || {};
  const active = runtimeStatus?.activeCommand?.id === id;
  const createdAt = command.createdAt || runtimeStatus?.activeCommand?.createdAt || response.startedAt || null;
  const lastHeartbeatAt = active ? runtimeStatus?.updatedAt || response.progress?.updatedAt || null : response.progress?.updatedAt || null;
  const updatedAt = latestIso([lastHeartbeatAt, response.finishedAt, response.completedAt, response.startedAt, createdAt]);
  const ageMs = createdAt ? Math.max(0, now - new Date(createdAt).getTime()) : null;
  const heartbeatAgeMs = lastHeartbeatAt ? now - new Date(lastHeartbeatAt).getTime() : null;
  const commandAgeMs = createdAt ? now - new Date(createdAt).getTime() : null;
  const status = response.status || null;
  const stale = Boolean(
    commandEntry &&
    !active &&
    commandAgeMs !== null &&
    commandAgeMs > BRIDGE_STALE_MS &&
    (!status || status === 'queued' || status === 'running')
  ) || Boolean(active && heartbeatAgeMs !== null && heartbeatAgeMs > BRIDGE_STALE_MS);
  const state = getState({ active, stale, status, commandEntry: Boolean(commandEntry) });

  return {
    id,
    type: command.type || response.type || runtimeStatus?.activeCommand?.type || 'unknown',
    path: command.path || runtimeStatus?.activeCommand?.path || null,
    state,
    reason: stateReason(state, active, status, commandAgeMs, heartbeatAgeMs),
    createdAt,
    updatedAt,
    lastHeartbeatAt,
    ageMs,
    commandFile: commandEntry?.file || null,
    responseStatus: status,
    canClearStale: state === 'stale' && !active && Boolean(commandEntry),
    canCancel: active && state === 'running',
  };
}

function getState(input: { active: boolean; stale: boolean; status: string | null; commandEntry: boolean }): BridgeQueueState {
  if (input.stale) return 'stale';
  if (input.active || input.status === 'running') return 'running';
  if (input.status && failedStatuses.has(input.status)) return 'failed';
  if (input.status && terminalStatuses.has(input.status)) return 'done';
  if (input.commandEntry) return 'pending';
  return 'done';
}

function stateReason(state: BridgeQueueState, active: boolean, status: string | null, commandAgeMs: number | null, heartbeatAgeMs: number | null): string {
  if (state === 'pending') return `Waiting for Obsidian bridge. Stale threshold: ${formatAge(BRIDGE_STALE_MS)}.`;
  if (state === 'running') return active ? 'Active command reported by runtime status.' : `Response status is ${status}.`;
  if (state === 'failed') return `Response status is ${status}.`;
  if (state === 'done') return `Response status is ${status || 'complete'}.`;
  if (heartbeatAgeMs !== null && heartbeatAgeMs > BRIDGE_STALE_MS) return `No heartbeat for ${formatAge(heartbeatAgeMs)}.`;
  if (commandAgeMs !== null) return `Pending command is ${formatAge(commandAgeMs)} old.`;
  return 'Command is stale.';
}

function getDisabledReason(runtimeStatus: RuntimeStatus | null, now: number): string | null {
  if (!runtimeStatus) return 'Obsidian is closed or has not written runtime status yet.';
  const heartbeatAgeMs = runtimeStatus.updatedAt ? now - new Date(runtimeStatus.updatedAt).getTime() : Number.POSITIVE_INFINITY;
  if (heartbeatAgeMs > BRIDGE_STALE_MS) return `No bridge heartbeat for ${formatAge(heartbeatAgeMs)}. Obsidian may be closed.`;
  if (!runtimeStatus.enabled) return 'Lab Bridge is disabled in Obsidian plugin settings.';
  return null;
}

function buildWarnings(runtimeStatus: RuntimeStatus | null, items: BridgeQueueItem[], disabledReason: string | null, now: number): string[] {
  const warnings: string[] = [];
  if (disabledReason) warnings.push(disabledReason);
  if (runtimeStatus?.updatedAt) {
    warnings.push(`Last heartbeat: ${new Date(runtimeStatus.updatedAt).toLocaleString()}.`);
  }
  const staleCount = items.filter((item) => item.state === 'stale').length;
  if (staleCount) warnings.push(`${staleCount} stale command${staleCount === 1 ? '' : 's'} can be cleared without deleting run history.`);
  if (runtimeStatus?.busy && runtimeStatus.activeCommand?.createdAt) {
    warnings.push(`Active command age: ${formatAge(now - new Date(runtimeStatus.activeCommand.createdAt).getTime())}.`);
  }
  warnings.push(`Stale threshold: ${formatAge(BRIDGE_STALE_MS)}.`);
  return warnings;
}

function emptyCounts(): Record<BridgeQueueState, number> {
  return {
    pending: 0,
    running: 0,
    stale: 0,
    failed: 0,
    done: 0,
  };
}

async function readCommandFiles(): Promise<Map<string, { file: string; command: BridgeCommandFile }>> {
  const result = new Map<string, { file: string; command: BridgeCommandFile }>();
  for (const file of await safeJsonFiles(commandsRoot())) {
    const command = await readJson<BridgeCommandFile>(path.join(commandsRoot(), file));
    const id = command?.id || path.basename(file, '.json');
    if (command) result.set(id, { file, command });
  }
  return result;
}

async function readResponseFiles(): Promise<Map<string, { response: BridgeResponseFile }>> {
  const result = new Map<string, { response: BridgeResponseFile }>();
  for (const file of await safeJsonFiles(responsesRoot())) {
    const response = await readJson<BridgeResponseFile>(path.join(responsesRoot(), file));
    const id = response?.id || path.basename(file, '.json');
    if (response) result.set(id, { response });
  }
  return result;
}

async function safeJsonFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function commandsRoot(): string {
  return path.join(labStateRoot, 'commands');
}

function responsesRoot(): string {
  return path.join(labStateRoot, 'responses');
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => value ? new Date(value).getTime() : NaN)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function formatAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
