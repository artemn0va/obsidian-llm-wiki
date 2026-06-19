import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, forkRoot, pluginInstallRoot } from '../config.js';
import { ensureDir, hashFile } from './fs.js';
import { runProcess } from './process.js';

const DEPLOY_FILES = ['main.js', 'manifest.json', 'styles.css'] as const;

export async function buildPlugin() {
  if (process.platform === 'win32') {
    return runProcess('cmd.exe', ['/d', '/s', '/c', 'pnpm build'], forkRoot);
  }

  return runProcess('pnpm', ['build'], forkRoot);
}

export async function deployPlugin() {
  assertInside(activeVaultRoot, pluginInstallRoot);
  await ensureDir(pluginInstallRoot);

  for (const filename of DEPLOY_FILES) {
    const source = path.join(forkRoot, filename);
    const target = assertInside(pluginInstallRoot, path.join(pluginInstallRoot, filename));
    await fs.copyFile(source, target);
  }

  return getPluginHashes();
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
