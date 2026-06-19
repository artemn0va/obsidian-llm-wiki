import path from 'node:path';

export const LAB_PORT = Number(process.env.WIKI_LAB_PORT || 48731);
export const LAB_HOST = process.env.WIKI_LAB_HOST || '127.0.0.1';

export const labRoot = path.resolve(process.env.WIKI_LAB_ROOT || process.cwd());
export const forkRoot = path.resolve(labRoot, '..');
export const activeVaultRoot = path.resolve(
  process.env.WIKI_LAB_VAULT_ROOT || 'C:\\Users\\hello\\Documents\\GitHub\\Roadmap',
);

export const wikiRoot = path.join(activeVaultRoot, 'wiki');
export const labStateRoot = path.join(activeVaultRoot, '.llm-wiki-lab');
export const pluginInstallRoot = path.join(activeVaultRoot, '.obsidian', 'plugins', 'karpathywiki');
export const resetScriptPath = path.join(activeVaultRoot, 'reset-wiki.ps1');
export const webDistRoot = path.join(labRoot, 'dist', 'web');

export function toPosix(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function assertInside(parent: string, child: string): string {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedChild;
  }

  throw new Error(`Path escapes allowed root: ${child}`);
}

export function assertSafeVaultRelative(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Path must be vault-relative.');
  }

  const normalized = toPosix(path.normalize(relativePath)).replace(/^\/+/, '');
  const lowered = normalized.toLowerCase();
  const blockedPrefixes = ['.git/', '.obsidian/', '.llm-wiki-lab/', 'wiki/'];

  if (
    normalized.includes('../') ||
    normalized === '..' ||
    blockedPrefixes.some((prefix) => lowered.startsWith(prefix)) ||
    ['.git', '.obsidian', '.llm-wiki-lab', 'wiki'].includes(lowered)
  ) {
    throw new Error(`Path is not allowed for Lab bridge commands: ${relativePath}`);
  }

  return normalized;
}

export function assertSafeWikiRelative(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Path must be vault-relative.');
  }

  const normalized = toPosix(path.normalize(relativePath)).replace(/^\/+/, '');
  if (!normalized.toLowerCase().startsWith('wiki/') || normalized.includes('../')) {
    throw new Error(`Only wiki files can be read here: ${relativePath}`);
  }

  return normalized;
}
