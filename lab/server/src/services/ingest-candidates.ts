import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, toPosix } from '../config.js';
import { listMarkdownFiles, pathExists } from './fs.js';

export interface IngestCandidate {
  path: string;
  title: string;
  kind: 'file' | 'folder';
  root: 'wiki-start' | 'sources';
  modifiedAt?: string;
  size?: number;
  markdownCount?: number;
}

export interface IngestCandidates {
  files: IngestCandidate[];
  folders: IngestCandidate[];
  recent: IngestCandidate[];
}

const ingestRoots: IngestCandidate['root'][] = ['wiki-start', 'sources'];
const maxFiles = 300;
const maxRecent = 30;

export async function getIngestCandidates(): Promise<IngestCandidates> {
  const files: IngestCandidate[] = [];
  const folderCounts = new Map<string, { root: IngestCandidate['root']; markdownCount: number }>();

  for (const root of ingestRoots) {
    const rootPath = assertInside(activeVaultRoot, path.join(activeVaultRoot, root));
    if (!(await pathExists(rootPath))) continue;

    const markdownFiles = await listMarkdownFiles(rootPath);
    folderCounts.set(root, { root, markdownCount: markdownFiles.length });

    for (const fullPath of markdownFiles) {
      const stats = await fs.stat(fullPath);
      const relativePath = toPosix(path.relative(activeVaultRoot, fullPath));
      files.push({
        path: relativePath,
        title: path.basename(fullPath, path.extname(fullPath)),
        kind: 'file',
        root,
        modifiedAt: stats.mtime.toISOString(),
        size: stats.size,
      });

      addFolderHierarchy(folderCounts, root, relativePath);
    }
  }

  const sortedFiles = files
    .sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || '') || a.path.localeCompare(b.path))
    .slice(0, maxFiles);

  return {
    files: sortedFiles,
    folders: await buildFolderCandidates(folderCounts),
    recent: sortedFiles.slice(0, maxRecent),
  };
}

function addFolderHierarchy(
  folderCounts: Map<string, { root: IngestCandidate['root']; markdownCount: number }>,
  root: IngestCandidate['root'],
  fileRelativePath: string,
): void {
  const parts = fileRelativePath.split('/');
  parts.pop();

  for (let i = 1; i <= parts.length; i += 1) {
    const relativePath = parts.slice(0, i).join('/');
    const existing = folderCounts.get(relativePath);
    folderCounts.set(relativePath, {
      root,
      markdownCount: (existing?.markdownCount || 0) + 1,
    });
  }
}

async function buildFolderCandidates(
  folderCounts: Map<string, { root: IngestCandidate['root']; markdownCount: number }>,
): Promise<IngestCandidate[]> {
  const folders: IngestCandidate[] = [];

  for (const [relativePath, info] of folderCounts) {
    const fullPath = assertInside(activeVaultRoot, path.join(activeVaultRoot, relativePath));
    const stats = await fs.stat(fullPath);
    folders.push({
      path: relativePath,
      title: path.basename(fullPath) || relativePath,
      kind: 'folder',
      root: info.root,
      modifiedAt: stats.mtime.toISOString(),
      markdownCount: info.markdownCount,
    });
  }

  return folders.sort((a, b) => a.path.localeCompare(b.path));
}
