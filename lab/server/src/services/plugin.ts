import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, forkRoot, labStateRoot, pluginInstallRoot } from '../config.js';
import { ensureDir, hashFile, readJson, writeJson } from './fs.js';
import { runProcess } from './process.js';
import type { ProcessResult } from './process.js';

const DEPLOY_FILES = ['main.js', 'manifest.json', 'styles.css'] as const;
const deployStatusPath = path.join(labStateRoot, 'deploy-status.json');
const deployLogPath = path.join(labStateRoot, 'logs', 'deploy.log');

export interface DeployStatus {
  lastBuildAt: string | null;
  lastBuildExitCode: number | null;
  lastDeployAt: string | null;
  lastDeployHash: string | null;
  lastDeployFiles: string[];
  lastDeployLog: string[];
  reloadNeeded: boolean;
}

export async function buildPlugin() {
  const build = process.platform === 'win32'
    ? await runProcess('cmd.exe', ['/d', '/s', '/c', 'pnpm build'], forkRoot)
    : await runProcess('pnpm', ['build'], forkRoot);

  const status = await getDeployStatus();
  const nextStatus: DeployStatus = {
    ...status,
    lastBuildAt: new Date().toISOString(),
    lastBuildExitCode: build.exitCode,
    lastDeployLog: recentLogLines(buildLogLines(build)),
  };
  await saveDeployStatus(nextStatus);
  await appendDeployLog(['Build finished.', ...buildLogLines(build)]);
  return build;
}

export async function deployPlugin() {
  assertInside(activeVaultRoot, pluginInstallRoot);
  await ensureDir(pluginInstallRoot);

  for (const filename of DEPLOY_FILES) {
    const source = path.join(forkRoot, filename);
    const target = assertInside(pluginInstallRoot, path.join(pluginInstallRoot, filename));
    await fs.copyFile(source, target);
  }

  const hashes = await getPluginHashes();
  const status = await getDeployStatus();
  const logLines = [
    `Deploy copied safe artifacts: ${DEPLOY_FILES.join(', ')}.`,
    `Fork hash: ${hashes.forkMainHash || 'missing'}.`,
    `Installed hash: ${hashes.installedMainHash || 'missing'}.`,
  ];
  const nextStatus: DeployStatus = {
    ...status,
    lastDeployAt: new Date().toISOString(),
    lastDeployHash: hashes.installedMainHash,
    lastDeployFiles: [...DEPLOY_FILES],
    lastDeployLog: recentLogLines(logLines),
    reloadNeeded: true,
  };
  await saveDeployStatus(nextStatus);
  await appendDeployLog(logLines);

  return hashes;
}

export async function buildAndDeployPlugin() {
  const build = await buildPlugin();
  if (build.exitCode !== 0) {
    return { build, deploy: null, success: false };
  }

  return {
    build,
    deploy: await deployPlugin(),
    success: true,
  };
}

export async function getPluginHashes() {
  const forkMainHash = await hashFile(path.join(forkRoot, 'main.js'));
  const installedMainHash = await hashFile(path.join(pluginInstallRoot, 'main.js'));
  return {
    forkMainHash,
    installedMainHash,
    hashMatch: Boolean(forkMainHash && installedMainHash && forkMainHash === installedMainHash),
  };
}

export async function getDeployStatus(): Promise<DeployStatus> {
  return (await readJson<DeployStatus>(deployStatusPath)) ?? {
    lastBuildAt: null,
    lastBuildExitCode: null,
    lastDeployAt: null,
    lastDeployHash: null,
    lastDeployFiles: [],
    lastDeployLog: [],
    reloadNeeded: false,
  };
}

export async function markPluginReloaded(): Promise<DeployStatus> {
  const status = await getDeployStatus();
  const nextStatus = {
    ...status,
    reloadNeeded: false,
  };
  await saveDeployStatus(nextStatus);
  await appendDeployLog(['Obsidian reload requested from Wiki Lab.']);
  return nextStatus;
}

function buildLogLines(build: ProcessResult): string[] {
  return [
    `Exit code: ${build.exitCode ?? 'unknown'}.`,
    ...tailLines(build.stdout, 12).map((line) => `stdout: ${line}`),
    ...tailLines(build.stderr, 12).map((line) => `stderr: ${line}`),
  ];
}

function tailLines(value: string, maxLines: number): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-maxLines);
}

function recentLogLines(lines: string[]): string[] {
  return lines.slice(-20);
}

async function saveDeployStatus(status: DeployStatus): Promise<void> {
  await writeJson(deployStatusPath, status);
}

async function appendDeployLog(lines: string[]): Promise<void> {
  await ensureDir(path.dirname(deployLogPath));
  const timestamp = new Date().toISOString();
  const content = lines.map((line) => `[${timestamp}] ${line}`).join('\n');
  await fs.appendFile(deployLogPath, `${content}\n`, 'utf8');
}
