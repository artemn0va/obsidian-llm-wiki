import { describe, it, expect } from 'vitest';
import { scanQuoteGrounding, ScannerPage } from '../../../wiki/lint/scanners';

function makePage(path: string, content: string): ScannerPage {
  return { path, content, basename: path.split('/').pop() || '' };
}

function makeSourceMap(entries: Record<string, string>): Map<string, ScannerPage> {
  const m = new Map<string, ScannerPage>();
  for (const [path, content] of Object.entries(entries)) {
    m.set(path, makePage(path, content));
  }
  return m;
}

function makePageMap(entries: Record<string, string>): Map<string, ScannerPage> {
  const m = new Map<string, ScannerPage>();
  for (const [path, content] of Object.entries(entries)) {
    m.set(path, makePage(path, content));
  }
  return m;
}

describe('scanQuoteGrounding', () => {
  it('returns empty when there are no wiki pages', () => {
    const result = scanQuoteGrounding(new Map(), new Map(), 'wiki');
    expect(result).toEqual([]);
  });

  it('returns empty when pages have no Mentions section', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': '# Foo\n\nSome body without mentions.',
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': '# Article\n\nSome body without mentions.',
    });
    expect(scanQuoteGrounding(pages, sources, 'wiki')).toEqual([]);
  });

  it('passes a quote that exists verbatim in the linked source', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "the quick brown fox" — [[sources/article]]`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nThe quick brown fox jumps over the lazy dog.`,
    });
    expect(scanQuoteGrounding(pages, sources, 'wiki')).toEqual([]);
  });

  it('flags a quote that does not exist in the linked source', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "this sentence is fabricated" — [[sources/article]]`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nThe quick brown fox jumps over the lazy dog.`,
    });
    const result = scanQuoteGrounding(pages, sources, 'wiki');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      pagePath: 'wiki/entities/Foo.md',
      sourcePath: 'wiki/sources/article.md',
      quote: 'this sentence is fabricated',
      hasSourceLink: true,
    });
  });

  it('flags a quote whose linked source file does not exist', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "anything" — [[sources/missing]]`,
    });
    const sources = makeSourceMap({});
    const result = scanQuoteGrounding(pages, sources, 'wiki');
    expect(result).toHaveLength(1);
    expect(result[0].sourcePath).toBe('wiki/sources/missing.md');
  });

  it('passes a historical bare quote when it exists in any source', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "the quick brown fox"`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nThe quick brown fox jumps over the lazy dog.`,
    });
    expect(scanQuoteGrounding(pages, sources, 'wiki')).toEqual([]);
  });

  it('flags a historical bare quote when it exists in no source', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "this sentence is fabricated"`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nThe quick brown fox jumps over the lazy dog.`,
    });
    const result = scanQuoteGrounding(pages, sources, 'wiki');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      pagePath: 'wiki/entities/Foo.md',
      quote: 'this sentence is fabricated',
      hasSourceLink: false,
    });
  });

  it('normalizes quotes for case and punctuation (Tier 2)', () => {
    const pages = makePageMap({
      'wiki/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "The Quick Brown Fox!" — [[sources/article]]`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nthe quick brown fox jumps over the lazy dog`,
    });
    expect(scanQuoteGrounding(pages, sources, 'wiki')).toEqual([]);
  });

  it('skips pages outside the wiki folder', () => {
    const pages = makePageMap({
      'other/entities/Foo.md': `# Foo\n\n## Mentions in Source\n- "the quick brown fox" — [[sources/article]]`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nThe quick brown fox jumps over the lazy dog.`,
    });
    expect(scanQuoteGrounding(pages, sources, 'wiki')).toEqual([]);
  });

  it('sorts results by page path then quote for deterministic reports', () => {
    const pages = makePageMap({
      'wiki/entities/Z.md': `# Z\n\n## Mentions in Source\n- "zzz" — [[sources/article]]`,
      'wiki/entities/A.md': `# A\n\n## Mentions in Source\n- "aaa" — [[sources/article]]`,
    });
    const sources = makeSourceMap({
      'wiki/sources/article.md': `# Article\n\nbody`,
    });
    const result = scanQuoteGrounding(pages, sources, 'wiki');
    expect(result.map(r => r.pagePath)).toEqual(['wiki/entities/A.md', 'wiki/entities/Z.md']);
  });
});
