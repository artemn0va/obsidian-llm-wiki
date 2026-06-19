import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, assertSafeVaultRelative, labStateRoot, toPosix, wikiRoot } from '../config.js';
import { ensureDir, hashFile, listMarkdownFiles, readJson, writeJson } from './fs.js';
import { runQA } from './qa.js';
import type { BridgeCommandInput } from '../schemas/api.js';

export interface BridgeCommand {
  id: string;
  type: BridgeCommandInput['type'];
  path?: string;
  granularity?: BridgeCommandInput['granularity'];
  createdAt: string;
  source: 'wiki-lab-ui';
}

export async function createBridgeCommand(input: BridgeCommandInput): Promise<BridgeCommand> {
  const id = crypto.randomUUID();
  const command: BridgeCommand = {
    id,
    type: input.type,
    path: input.path ? assertSafeVaultRelative(input.path) : undefined,
    granularity: input.granularity,
    createdAt: new Date().toISOString(),
    source: 'wiki-lab-ui',
  };

  if ((command.type === 'ingest-file' || command.type === 'ingest-folder') && !command.path) {
    throw new Error(`${command.type} requires a vault-relative path.`);
  }

  const commandsRoot = path.join(labStateRoot, 'commands');
  const runRoot = path.join(labStateRoot, 'runs', id);
  await ensureDir(commandsRoot);
  await ensureDir(runRoot);
  await writeJson(path.join(runRoot, 'command.json'), command);
  const before = await snapshotWiki();
  await writeJson(path.join(runRoot, 'before.json'), before);
  await backupWikiFiles(runRoot, before);
  await writeJson(path.join(runRoot, 'qa-before.json'), await runQA());
  await writeJson(path.join(commandsRoot, `${id}.json`), command);

  return command;
}

export async function getBridgeCommand(id: string) {
  const responsePath = path.join(labStateRoot, 'responses', `${id}.json`);
  const response = await readJson<Record<string, unknown>>(responsePath);
  const runRoot = path.join(labStateRoot, 'runs', id);

  if (response && isTerminalResponse(response)) {
    await finalizeRunIfNeeded(id, response);
  }

  return {
    id,
    response,
    command: await readJson(path.join(runRoot, 'command.json')),
    before: await readJson(path.join(runRoot, 'before.json')),
    after: await readJson(path.join(runRoot, 'after.json')),
    diff: await readJson(path.join(runRoot, 'diff.json')),
    qa: await readJson(path.join(runRoot, 'qa.json')),
  };
}

async function finalizeRunIfNeeded(id: string, response: Record<string, unknown>): Promise<void> {
  const runRoot = path.join(labStateRoot, 'runs', id);
  const afterPath = path.join(runRoot, 'after.json');

  try {
    await fs.access(afterPath);
    return;
  } catch {
    // Continue.
  }

  const before = await readJson<WikiSnapshot>(path.join(runRoot, 'before.json'));
  const after = await snapshotWiki();
  const qaAfter = await runQA();
  await writeJson(afterPath, after);
  await writeJson(path.join(runRoot, 'response.json'), response);
  await writeJson(path.join(runRoot, 'diff.json'), diffSnapshots(before, after));
  await writeJson(path.join(runRoot, 'qa.json'), qaAfter);
  await writeJson(path.join(runRoot, 'qa-after.json'), qaAfter);
}

function isTerminalResponse(response: Record<string, unknown>): boolean {
  return ['success', 'error', 'cancelled'].includes(String(response.status));
}

export interface WikiSnapshot {
  capturedAt: string;
  files: Array<{
    path: string;
    size: number;
    modifiedAt: string;
    sha256: string | null;
  }>;
}

export interface WikiBackupManifest {
  capturedAt: string;
  files: Array<{
    path: string;
    backupPath: string;
    sha256: string | null;
    size: number;
  }>;
}

async function snapshotWiki(): Promise<WikiSnapshot> {
  const files = await listMarkdownFiles(wikiRoot);
  const snapshotFiles = await Promise.all(
    files.map(async (fullPath) => {
      const stats = await fs.stat(fullPath);
      return {
        path: toPosix(path.relative(activeVaultRoot, assertInside(wikiRoot, fullPath))),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        sha256: await hashFile(fullPath),
      };
    }),
  );

  return {
    capturedAt: new Date().toISOString(),
    files: snapshotFiles,
  };
}

function diffSnapshots(before: WikiSnapshot | null, after: WikiSnapshot) {
  const beforeMap = new Map((before?.files || []).map((file) => [file.path, file]));
  const afterMap = new Map(after.files.map((file) => [file.path, file]));

  return {
    created: after.files.filter((file) => !beforeMap.has(file.path)),
    deleted: (before?.files || []).filter((file) => !afterMap.has(file.path)),
    changed: after.files.filter((file) => {
      const previous = beforeMap.get(file.path);
      return previous && previous.sha256 !== file.sha256;
    }),
  };
}

async function backupWikiFiles(runRoot: string, snapshot: WikiSnapshot): Promise<void> {
  const backupsRoot = path.join(runRoot, 'backups');
  const manifest: WikiBackupManifest = {
    capturedAt: new Date().toISOString(),
    files: [],
  };

  await ensureDir(backupsRoot);

  for (const file of snapshot.files) {
    const fullPath = assertInside(wikiRoot, path.join(activeVaultRoot, file.path));
    const backupName = `${Buffer.from(file.path).toString('base64url')}.md`;
    const backupPath = path.join(backupsRoot, backupName);

    await fs.copyFile(fullPath, backupPath);
    manifest.files.push({
      path: file.path,
      backupPath: toPosix(path.relative(runRoot, backupPath)),
      sha256: file.sha256,
      size: file.size,
    });
  }

  await writeJson(path.join(backupsRoot, 'manifest.json'), manifest);
}
