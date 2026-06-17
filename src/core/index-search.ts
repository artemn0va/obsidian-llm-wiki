import { computeSlug } from './slug';

interface PageRef {
  path: string;
  title: string;
  aliases: string[];
  score: number;
}

export function parseIndexForPages(indexContent: string): Omit<PageRef, 'score'>[] {
  const pages: Omit<PageRef, 'score'>[] = [];
  const lineRegex = /- \[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(?:`aliases:\s*([^`]+)`)?/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(indexContent)) !== null) {
    const path = match[1];
    const aliasStr = match[2] || '';
    const title = path.split('/').pop() || path;
    const aliases = aliasStr.split(',').map(a => a.trim()).filter(Boolean);
    pages.push({ path, title, aliases });
  }
  return pages;
}

export function localKeywordMatch(query: string, pages: Omit<PageRef, 'score'>[]): PageRef[] {
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  const scored: PageRef[] = [];
  for (const page of pages) {
    let score = 0;
    const titleLower = page.title.toLowerCase();
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 3;
      for (const alias of page.aliases) {
        if (alias.toLowerCase().includes(kw)) score += 2;
      }
    }
    if (score > 0) scored.push({ ...page, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

export function matchExtractedToExisting(
  extractedNames: string[],
  existingPages: Array<{ title: string; aliases?: string[] }>
): string[] {
  const pageSlugs = existingPages.map(p => ({
    title: p.title,
    slug: computeSlug(p.title),
    aliasSlugs: (p.aliases || []).map(a => computeSlug(a)),
  }));

  const matched = new Set<string>();
  for (const name of extractedNames) {
    const targetSlug = computeSlug(name);
    const match = pageSlugs.find(p =>
      p.slug === targetSlug ||
      p.aliasSlugs.some(a => a === targetSlug)
    );
    if (match) matched.add(match.title);
  }
  return [...matched];
}
