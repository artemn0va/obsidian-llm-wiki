import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, assertSafeWikiRelative, labStateRoot } from '../config.js';
import { readJson } from './fs.js';
import type { WikiBackupManifest } from './bridge.js';

export interface RunDiffFileContent {
  runId: string;
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
  beforeExists: boolean;
  afterExists: boolean;
}

export async function readRunDiffFile(runId: string, relativePath: string): Promise<RunDiffFileContent> {
  const safeRelative = assertSafeWikiRelative(relativePath);
  const runRoot = path.join(labStateRoot, 'runs', runId);
  const manifest = await readJson<WikiBackupManifest>(path.join(runRoot, 'backups', 'manifest.json'));
  const backupEntry = manifest?.files.find((file) => file.path === safeRelative);
  const beforeContent = backupEntry
    ? await readOptionalText(assertInside(runRoot, path.join(runRoot, backupEntry.backupPath)))
    : null;
  const afterContent = await readOptionalText(assertInside(activeVaultRoot, path.join(activeVaultRoot, safeRelative)));

  return {
    runId,
    path: safeRelative,
    beforeContent,
    afterContent,
    beforeExists: beforeContent !== null,
    afterExists: afterContent !== null,
  };
}

async function readOptionalText(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}
