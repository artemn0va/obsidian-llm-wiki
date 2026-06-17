import { EngineContext } from '../../types';
import { PROMPTS } from '../../prompts';
import { TOKENS_LINT_ORPHAN_FIX } from '../../constants';
import { buildSystemPrompt, getSectionLabels } from '../system-prompts';
import { parseJsonResponse } from '../../core/json';
import { cleanWikiIndex } from '../../core/prompt-builders';
import {
  buildOrphanLinkPrompt,
  validateOrphanLinkTarget,
  buildOrphanLinkUpdate,
  normalizeOrphanPagePath,
} from '../../core/orphan-matcher';

export async function linkOrphanPage(
  ctx: EngineContext,
  orphanPath: string
): Promise<string[]> {
  const orphanContent = await ctx.tryReadFile(orphanPath);
  if (!orphanContent) return [];

  const indexPath = `${ctx.settings.wikiFolder}/index.md`;
  const rawWikiIndex = (await ctx.tryReadFile(indexPath)) || '';

  const wikiIndex = cleanWikiIndex(rawWikiIndex);
  const prompt = buildOrphanLinkPrompt(PROMPTS.linkOrphanPage, {
    orphanContent,
    wikiIndex,
  });

  const client = ctx.getClient();
  if (!client) return [];

  const response = await client.createMessage({
    model: ctx.settings.model,
    max_tokens: TOKENS_LINT_ORPHAN_FIX,
    system: await buildSystemPrompt(
      ctx.settings,
      ctx.getSchemaContext,
      'lint'
    ),
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    enableThinking: !ctx.settings.disableThinking,
  });

  const result = (await parseJsonResponse(response)) as {
    related_pages?: Array<{
      page_path: string;
      link_text: string;
      link_target: string;
    }>;
  } | null;

  if (!result?.related_pages?.length) return [];

  const linkedPages: string[] = [];
  const labels = getSectionLabels(ctx.settings);

  for (const related of result.related_pages) {
    const fullPath = normalizeOrphanPagePath(
      related.page_path,
      ctx.settings.wikiFolder
    );
    const relatedContent = await ctx.tryReadFile(fullPath);
    if (!relatedContent) continue;

    if (!validateOrphanLinkTarget(relatedContent, related.link_target)) {
      const updated = buildOrphanLinkUpdate(
        relatedContent,
        {
          pagePath: related.page_path,
          linkText: related.link_text,
          linkTarget: related.link_target,
        },
        labels.related_pages
      );
      await ctx.createOrUpdateFile(fullPath, updated);
      linkedPages.push(related.page_path);
    }
  }
  return linkedPages;
}
