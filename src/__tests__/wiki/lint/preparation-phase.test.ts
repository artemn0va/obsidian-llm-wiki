import { describe, it, expect } from 'vitest';
import { runPreparationPhase } from '../../../wiki/lint/phases/preparation';
import { LintPhaseContext } from '../../../wiki/lint/types';
import { LLMWikiSettings } from '../../../types';

function makeMockApp(files: Record<string, string>, abstractFiles: string[] = []) {
  const tfiles = new Map<string, { path: string; basename: string }>();
  for (const [path] of Object.entries(files)) {
    tfiles.set(path, { path, basename: path.split('/').pop()?.replace('.md', '') || '' });
  }
  return {
    vault: {
      getMarkdownFiles: () => Array.from(tfiles.values()),
      read: async (file: { path: string }) => files[file.path] ?? '',
      getAbstractFileByPath: (path: string) => {
        if (!abstractFiles.includes(path)) return null;
        return { path };
      },
      process: async (file: { path: string }, fn: (data: string) => string | Promise<string>) => {
        const result = await fn(files[file.path] ?? '');
        files[file.path] = result;
        return result;
      },
    },
  };
}

function makeContext(files: Record<string, string>, abstractFiles: string[] = [], settings?: Partial<LLMWikiSettings>): LintPhaseContext {
  return {
    app: makeMockApp(files, abstractFiles) as unknown as LintPhaseContext['app'],
    settings: {
      wikiFolder: 'wiki',
      language: 'en',
      slugCase: 'lower',
      ...settings,
    } as LLMWikiSettings,
    wikiEngine: { updateStatusBar: () => {} } as unknown as LintPhaseContext['wikiEngine'],
    checkCancelled: () => {},
    stageNotice: null,
    totalPages: 0,
  };
}

describe('runPreparationPhase', () => {
  it('reads wiki pages and returns a populated pageMap', async () => {
    const files = {
      'wiki/entities/Foo.md': '# Foo\n\nBody',
      'wiki/concepts/Bar.md': '# Bar\n\nBody',
    };
    const ctx = makeContext(files);
    const result = await runPreparationPhase(ctx);

    expect(result.wikiFiles).toHaveLength(2);
    expect(result.pageMap.has('wiki/entities/Foo.md')).toBe(true);
    expect(result.pageMap.get('wiki/entities/Foo.md')?.content).toBe('# Foo\n\nBody');
  });

  it('filters out index, log, schema, and contradictions files', async () => {
    const files = {
      'wiki/index.md': '# Index',
      'wiki/log.md': '# Log',
      'wiki/schema/config.md': '---\n---',
      'wiki/contradictions/x.md': 'x',
      'wiki/entities/Keep.md': '# Keep',
    };
    const ctx = makeContext(files);
    const result = await runPreparationPhase(ctx);

    expect(result.wikiFiles).toHaveLength(1);
    expect(result.wikiFiles[0].path).toBe('wiki/entities/Keep.md');
  });

  it('fixes double-nested wiki links in place', async () => {
    const files = {
      'wiki/entities/Foo.md': 'See [[[[Nested]]]] link.',
    };
    const ctx = makeContext(files, ['wiki/entities/Foo.md']);
    const result = await runPreparationPhase(ctx);

    expect(result.doubleNestFixes).toBe(1);
    expect(result.pageMap.get('wiki/entities/Foo.md')?.content).toBe('See [[Nested]] link.');
  });

  it('normalizes polluted sources fields', async () => {
    const files = {
      'wiki/sources/Article.md': '---\nsources:\n  - "https://example.com"\n---\n\nBody',
    };
    const ctx = makeContext(files, ['wiki/sources/Article.md']);
    const result = await runPreparationPhase(ctx);

    expect(result.sourcesNormalizedFiles).toBe(1);
    expect(result.sourcesNormalizedEntries).toBeGreaterThan(0);
  });
});
