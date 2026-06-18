import { EngineContext } from '../../types';
import { PROMPTS } from '../../prompts';
import { TOKENS_LINT_PAGE_FIX, WIKI_SUBFOLDERS } from '../../constants';
import { buildSystemPrompt } from '../system-prompts';
import { parseJsonResponse } from '../../core/json';
import { slugify } from '../../core/slug';
import {
  findDeadLinkTarget,
  buildDeadLinkReplacement,
  replaceDeadLink,
} from '../../core/dead-link-detector';
import { getExistingWikiPages } from './get-existing-pages';

const PLURAL_MAP: Record<string, string> = {
  entity: WIKI_SUBFOLDERS.entities,
  concept: WIKI_SUBFOLDERS.concepts,
};

function makeRelPath(path: string, wikiFolder: string): string {
  return path.replace(wikiFolder + '/', '').replace(/\.md$/i, '');
}

function replaceTargetLink(sourceContent: string, targetName: string, newLink: string): string {
  const linkRegex = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;
  return sourceContent.replace(
    linkRegex,
    (fullMatch: string, capturedTarget: string) => {
      if (capturedTarget.trim() === targetName) return newLink;
      return fullMatch;
    }
  );
}

export async function fixDeadLink(
  ctx: EngineContext,
  sourcePath: string,
  targetName: string
): Promise<string> {
  const existingPages = await getExistingWikiPages(
    ctx.app,
    ctx.settings.wikiFolder
  );

  // ---- Pre-check: deterministic title + alias match ----
  const sourceContent =
    (await ctx.tryReadFile(sourcePath)) || '(empty)';
  const targetBasename = targetName.includes('/')
    ? targetName.split('/').pop()!
    : targetName;

  const preMatch = findDeadLinkTarget(existingPages, targetBasename);

  if (preMatch) {
    const newLink = buildDeadLinkReplacement(preMatch, ctx.settings.wikiFolder);
    const updatedContent = replaceDeadLink(sourceContent, targetName, newLink);
    await ctx.createOrUpdateFile(sourcePath, updatedContent);
    return `pre-check corrected (alias match): ${newLink}`;
  }

  // ---- LLM path: semantic matching with alias-aware prompt ----
  const pagesList = existingPages
    .filter(p => {
      const bn = p.title || '';
      const hasPollutedBasename = /^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/.test(bn);
      return !hasPollutedBasename;
    })
    .map(p => {
      const aliasSuffix = p.aliases?.length ? ` \`aliases: ${p.aliases.join(', ')}\`` : '';
      return `- ${p.wikiLink}${aliasSuffix}`;
    }).join('\n');

  const prompt = PROMPTS.fixDeadLink
    .replace('{{source_content}}', sourceContent.substring(0, 2000))
    .replace('{{target_name}}', targetName)
    .replace('{{existing_pages}}', pagesList.substring(0, 3000));

  const client = ctx.getClient();
  if (!client) return 'no action taken (no client)';

  let response = await client.createMessage({
    model: ctx.settings.model,
    max_tokens: TOKENS_LINT_PAGE_FIX,
    system: await buildSystemPrompt(
      ctx.settings,
      ctx.getSchemaContext,
      'lint'
    ),
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    ...(ctx.settings.disableThinking ? { enableThinking: false } : {}),
  });

  if (!response) {
    console.debug(
      `fixDeadLink: empty response for target "${targetName}", retrying without JSON mode`
    );
    response = await client.createMessage({
      model: ctx.settings.model,
      max_tokens: TOKENS_LINT_PAGE_FIX,
      system: await buildSystemPrompt(
        ctx.settings,
        ctx.getSchemaContext,
        'lint'
      ),
      messages: [{ role: 'user', content: prompt }],
      ...(ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });
  }

  const result = (await parseJsonResponse(response)) as {
    action?: string;
    correct_link?: string;
    stub_title?: string;
    stub_type?: string;
  } | null;

  if (result?.action === 'correct' && result.correct_link) {
    let newLink = result.correct_link.trim();
    if (!newLink.startsWith('[[')) {
      newLink = `[[${newLink}]]`;
    }

    const updatedContent = replaceTargetLink(sourceContent, targetName, newLink);
    await ctx.createOrUpdateFile(sourcePath, updatedContent);
    return `corrected: ${newLink}`;
  }

  if (result?.action === 'create_stub' && result.stub_title) {
    const sanitizedTitle = result.stub_title.replace(/^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/, '$2');

    // Safety net: re-check aliases before creating a stub.
    const stubTitleLower = sanitizedTitle.toLowerCase();
    const safetySlug = slugify(sanitizedTitle).toLowerCase();
    const aliasMatch = existingPages.find(p =>
      p.title.toLowerCase() === stubTitleLower ||
      p.aliases?.some(a => a.toLowerCase() === stubTitleLower) ||
      slugify(p.title).toLowerCase() === safetySlug ||
      p.aliases?.some(a => slugify(a).toLowerCase() === safetySlug)
    );
    if (aliasMatch) {
      const newLink = `[[${makeRelPath(aliasMatch.path, ctx.settings.wikiFolder)}|${aliasMatch.title}]]`;
      const updatedContent = replaceTargetLink(sourceContent, targetName, newLink);
      await ctx.createOrUpdateFile(sourcePath, updatedContent);
      return `safety-net corrected (alias match for stub): ${newLink}`;
    }

    const stubType = result.stub_type || 'entity';
    const stubDir = PLURAL_MAP[stubType] || `${stubType}s`;
    const stubSlug = slugify(sanitizedTitle, ctx.settings.slugCase === 'preserve');
    const stubPath = `${ctx.settings.wikiFolder}/${stubDir}/${stubSlug}.md`;
    const sourceRel = makeRelPath(sourcePath, ctx.settings.wikiFolder);
    const stubContent = `---\ntype: ${stubType}\ncreated: ${new Date().toISOString().split('T')[0]}\nsources: ["[[${sourceRel}]]"]\ntags: [${stubType === 'entity' ? 'other' : 'term'}]\n---\n# ${sanitizedTitle}\n\n> Auto-generated stub page — referenced by [[${sourceRel}]].\n`;

    await ctx.createOrUpdateFile(stubPath, stubContent);
    // Expand the stub with AI-generated content immediately.
    const { fillEmptyPage } = await import('./fill-empty-page');
    await fillEmptyPage(ctx, stubPath);

    const newLink = `[[${stubDir}/${stubSlug}|${sanitizedTitle}]]`;
    const updatedContent = replaceTargetLink(sourceContent, targetName, newLink);
    await ctx.createOrUpdateFile(sourcePath, updatedContent);
    return `stub created and expanded: ${stubPath}`;
  }

  // ---- Deterministic fallback when LLM fails ----
  const lowerTarget = targetBasename.toLowerCase();
  const targetSlug = slugify(targetBasename).toLowerCase();
  let match = existingPages.find(p =>
    p.title.toLowerCase() === lowerTarget ||
    slugify(p.title).toLowerCase() === targetSlug
  );

  if (!match) {
    match = existingPages.find(p =>
      p.aliases?.some(a =>
        a.toLowerCase() === lowerTarget ||
        slugify(a).toLowerCase() === targetSlug
      )
    );
  }

  if (match) {
    const newLink = `[[${makeRelPath(match.path, ctx.settings.wikiFolder)}|${match.title}]]`;
    const updatedContent = replaceTargetLink(sourceContent, targetName, newLink);
    await ctx.createOrUpdateFile(sourcePath, updatedContent);
    return `fallback corrected: ${newLink}`;
  }

  // No match — create a basic stub and expand it.
  const cleanBasename = targetBasename.replace(/^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/, '$2');
  const stubType = targetName.includes('/entities/') ? 'entity' : 'concept';
  const stubDir = stubType === 'entity' ? WIKI_SUBFOLDERS.entities : WIKI_SUBFOLDERS.concepts;
  const stubSlug = slugify(cleanBasename, ctx.settings.slugCase === 'preserve');
  const stubPath = `${ctx.settings.wikiFolder}/${stubDir}/${stubSlug}.md`;
  const sourceRel = makeRelPath(sourcePath, ctx.settings.wikiFolder);
  const stubContent = `---\ntype: ${stubType}\ncreated: ${new Date().toISOString().split('T')[0]}\nsources: ["[[${sourceRel}]]"]\ntags: [${stubType === 'entity' ? 'other' : 'term'}]\n---\n# ${cleanBasename}\n\n> Auto-generated stub page — referenced by [[${sourceRel}]].\n`;

  await ctx.createOrUpdateFile(stubPath, stubContent);
  const { fillEmptyPage } = await import('./fill-empty-page');
  await fillEmptyPage(ctx, stubPath);

  const newLink = `[[${stubDir}/${stubSlug}|${cleanBasename}]]`;
  const updatedContent = replaceTargetLink(sourceContent, targetName, newLink);
  await ctx.createOrUpdateFile(sourcePath, updatedContent);
  return `fallback stub created and expanded: ${stubPath}`;
}
