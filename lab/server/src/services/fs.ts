import crypto from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { activeVaultRoot, assertInside, assertSafeWikiRelative, toPosix, wikiRoot } from '../config.js';

export interface MarkdownFileInfo {
  path: string;
  title: string;
  type: string;
  tags: string[];
  aliases: string[];
  sources: string[];
  size: number;
  modifiedAt: string;
  warningCount: number;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function readJson<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function writeJson(target: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function hashFile(target: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(target);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

export async function listMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = String(entry.name);
      const fullPath = path.join(current, name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && name.toLowerCase().endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

export function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = content.slice(3, end).trim();
  const result: Record<string, unknown> = {};

  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

function frontmatterArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function readWikiFile(relativePath: string): Promise<{ path: string; content: string }> {
  const safeRelative = assertSafeWikiRelative(relativePath);
  const fullPath = assertInside(activeVaultRoot, path.join(activeVaultRoot, safeRelative));
  return {
    path: safeRelative,
    content: await fs.readFile(fullPath, 'utf8'),
  };
}

export async function getWikiFiles(): Promise<MarkdownFileInfo[]> {
  const files = await listMarkdownFiles(wikiRoot);
  const result: MarkdownFileInfo[] = [];

  for (const fullPath of files) {
    const relative = toPosix(path.relative(activeVaultRoot, fullPath));
    const content = await fs.readFile(fullPath, 'utf8');
    const stats = await fs.stat(fullPath);
    const frontmatter = parseFrontmatter(content);
    const bodyTitle = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
    const title = String(frontmatter.title || bodyTitle || path.basename(fullPath, '.md'));
    const type = String(frontmatter.type || inferType(relative));
    const warningCount = countLocalWarnings(relative, content, type);

    result.push({
      path: relative,
      title,
      type,
      tags: frontmatterArray(frontmatter.tags),
      aliases: frontmatterArray(frontmatter.aliases),
      sources: frontmatterArray(frontmatter.sources),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      warningCount,
    });
  }

  return result;
}

function inferType(relativePath: string): string {
  if (relativePath.includes('/entities/')) return 'entity';
  if (relativePath.includes('/concepts/')) return 'concept';
  if (relativePath.includes('/sources/')) return 'source';
  if (relativePath.includes('/schema/')) return 'schema';
  return 'system';
}

function countLocalWarnings(relativePath: string, content: string, type: string): number {
  let count = 0;
  if (content.includes('source_file:')) count += 1;
  if (content.includes('Active Tag Vocabulary')) count += 1;
  if (relativePath.includes('#-')) count += 1;
  if ((type === 'entity' || type === 'concept') && !content.includes('sources:')) count += 1;
  return count;
}
