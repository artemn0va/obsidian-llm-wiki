import { App } from 'obsidian';
import { parseFrontmatter } from '../../core/frontmatter';

export async function getExistingWikiPages(
  app: App,
  wikiFolder: string
): Promise<Array<{ path: string; title: string; wikiLink: string; aliases?: string[] }>> {
  const wikiFiles = app.vault
    .getMarkdownFiles()
    .filter(
      f =>
        f.path.startsWith(wikiFolder) &&
        !f.path.includes('index.md') &&
        !f.path.includes('log.md') &&
        !f.path.includes('/schema/') &&
        !f.path.includes('/contradictions/')
    );

  const pages: Array<{ path: string; title: string; wikiLink: string; aliases?: string[] }> = [];
  for (const f of wikiFiles) {
    const relPath = f.path.replace(wikiFolder + '/', '').replace('.md', '');
    const content = await app.vault.read(f);
    const fm = parseFrontmatter(content);
    pages.push({
      path: f.path,
      title: f.basename,
      wikiLink: `[[${relPath}|${f.basename}]]`,
      aliases: Array.isArray(fm?.aliases) ? fm.aliases : undefined,
    });
  }
  return pages;
}
