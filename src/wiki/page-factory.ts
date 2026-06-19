// Page Factory — entity/concept page CRUD, related-page updates, and multi-source merge.
// Extracted from WikiEngine.

import { TFile } from 'obsidian';
import {
  EngineContext,
  EntityInfo,
  ConceptInfo,
  ExtractionCentrality,
  ExtractionRole,
  SourceAnalysis,
  PageCreationResult,
} from '../types';
import { PROMPTS } from '../prompts';
import { ConflictResolver } from '../core/conflict-resolver';
import { WIKI_SUBFOLDERS } from '../constants';
import { TOKENS_DEDUP_RESOLUTION, TOKENS_PAGE_GENERATION, TOKENS_APPEND_REVIEWED } from '../constants';
import { slugify, filterRedundantAliases } from '../core/slug';
import { parseJsonResponse } from '../core/json';
import { parseFrontmatter, mergeFrontmatter, enforceFrontmatterConstraints } from '../core/frontmatter';
import { truncateMentions } from '../core/report';
import { cleanMarkdownResponse, sanitizeWikiLinksToAllowedTargets } from '../core/markdown';
import { normalizeLLMPath } from '../core/prompt-builders';
import { UNIVERSAL_LINK_CONSTRAINTS } from './prompts/constraints';
import { applySectionLabels } from './system-prompts';
import { getExistingWikiPages } from './lint/get-existing-pages';

// Wrap errors with entity/concept context for better diagnostics
function contextualizeError(error: unknown, name: string, pageType: string): Error {
  const msg = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to create ${pageType} page "${name}": ${msg}`);
}

function mergeError(error: unknown, name: string, pageType: string): Error {
  const msg = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to merge ${pageType} page "${name}": ${msg}`);
}

function getGeneratedSourcePageRef(
  sourceFile: TFile | { path: string; basename: string },
  settings: EngineContext['settings']
): string {
  return `sources/${slugify(sourceFile.basename, settings.slugCase === 'preserve')}`;
}

function toWikiRelPath(path: string, wikiFolder: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(`${wikiFolder}/`, '')
    .replace(/\.md$/i, '');
}

const EXTRACTION_ROLES: readonly ExtractionRole[] = [
  'core_idea',
  'architecture',
  'workflow',
  'mechanism',
  'principle',
  'tradeoff',
  'tool',
  'source_navigation',
  'historical_analogy',
  'implementation_detail',
];

const EXTRACTION_CENTRALITIES: readonly ExtractionCentrality[] = [
  'core',
  'supporting',
  'mention',
];

function normalizeExtractionRole(
  info: EntityInfo | ConceptInfo,
  pageType: 'entity' | 'concept'
): ExtractionRole {
  if (info.role && EXTRACTION_ROLES.includes(info.role)) return info.role;

  const haystack = `${info.name} ${info.type} ${info.summary}`.toLowerCase();
  if (pageType === 'entity' && info.type === 'product') return 'tool';
  if (/\b(tool|plugin|cli|extension|software|service|app|qmd|marp|dataview|obsidian)\b/.test(haystack)) return 'tool';
  if (/\b(workflow|loop|pipeline|process|ingest|query|lint)\b/.test(haystack)) return 'workflow';
  if (/\b(architecture|system|layer|source of truth|schema)\b/.test(haystack)) return 'architecture';
  if (/\b(mechanism|how it works|indexing|retrieval|synthesis)\b/.test(haystack)) return 'mechanism';
  if (/\b(tradeoff|versus|vs\.?|compare|comparison)\b/.test(haystack)) return 'tradeoff';
  if (/\b(memex|historical analogy|analogy)\b/.test(haystack)) return 'historical_analogy';

  return pageType === 'concept' ? 'core_idea' : 'implementation_detail';
}

function normalizeExtractionCentrality(
  info: EntityInfo | ConceptInfo,
  role: ExtractionRole,
  pageType: 'entity' | 'concept'
): ExtractionCentrality {
  if (info.centrality && EXTRACTION_CENTRALITIES.includes(info.centrality)) return info.centrality;
  if (role === 'implementation_detail') return pageType === 'entity' ? 'supporting' : 'mention';
  if (role === 'tool' || role === 'historical_analogy') return 'supporting';
  return pageType === 'concept' ? 'core' : 'supporting';
}

async function buildAllowedWikiLinkTargets(
  ctx: EngineContext,
  currentPath: string,
  sourcePageRef: string,
  additionalAllowedPaths: string[] = []
): Promise<Set<string>> {
  const allowedTargets = new Set<string>();
  allowedTargets.add(sourcePageRef);
  allowedTargets.add(toWikiRelPath(currentPath, ctx.settings.wikiFolder));

  for (const path of additionalAllowedPaths) {
    allowedTargets.add(toWikiRelPath(path, ctx.settings.wikiFolder));
  }

  const existingPages = await getExistingWikiPages(ctx.app, ctx.settings.wikiFolder);
  for (const page of existingPages) {
    allowedTargets.add(toWikiRelPath(page.path, ctx.settings.wikiFolder));
  }

  return allowedTargets;
}

export class PageFactory {
  constructor(private ctx: EngineContext) {}

  // Append aliases to an existing wiki page, deduplicating against existing frontmatter.
  private async appendAliases(pagePath: string, newAliases: string[]): Promise<void> {
    const content = await this.ctx.tryReadFile(pagePath);
    if (!content) return;

    // Drop aliases that already equal the page's filename (case-insensitive),
    // e.g. adding "Vigilanz" to vigilanz.md. Common on cross-type collisions
    // where the colliding name is identical to the existing page's name.
    const candidates = filterRedundantAliases(pagePath, newAliases);
    if (candidates.length === 0) return;

    const fm = parseFrontmatter(content);
    const existingAliases = Array.isArray(fm?.aliases) ? fm.aliases : [];
    const toAdd = candidates.filter(a => !existingAliases.includes(a));
    if (toAdd.length === 0) return;

    const merged = [...existingAliases, ...toAdd];
    const aliasesLine = `aliases:\n${merged.map(a => `  - "${a}"`).join('\n')}`;

    // Replace existing aliases block or inject before closing ---
    const fmStart = content.indexOf('---');
    const fmEnd = content.indexOf('\n---', fmStart + 3);
    if (fmStart === -1 || fmEnd === -1) return;

    const fmText = content.substring(fmStart + 3, fmEnd);
    const body = content.substring(fmEnd + 4);

    let newFm: string;
    if (fmText.includes('aliases:')) {
      // Replace existing aliases block
      newFm = fmText.replace(/^aliases:[\s\S]*?(?=\n\S|\n*$)/m, aliasesLine);
    } else {
      // Inject before closing ---
      newFm = fmText.trimEnd() + '\n' + aliasesLine;
    }

    const newContent = `---${newFm}\n---${body}`;
    await this.ctx.createOrUpdateFile(pagePath, newContent);
    console.debug(`appendAliases: added ${toAdd.join(', ')} to ${pagePath}`);
  }

  // Determine the actual file path for a new entity/concept, using slug-based
  // matching first and falling back to LLM semantic resolution.
  // Returns { path: null, collision: {...} } when a cross-type collision is detected
  // (same name exists in the opposite folder). Callers must NOT create a new file in
  // that case, but should merge the new content into collision.targetPath so no
  // information from the source is lost.
  private async resolvePagePath(
    name: string,
    pageType: 'entity' | 'concept',
    summary: string
  ): Promise<PageCreationResult> {
    const folder = pageType === 'entity' ? WIKI_SUBFOLDERS.entities : WIKI_SUBFOLDERS.concepts;
    const otherFolder = pageType === 'entity' ? WIKI_SUBFOLDERS.concepts : WIKI_SUBFOLDERS.entities;
    const slug = slugify(name, this.ctx.settings.slugCase === 'preserve');
    const slugPath = `${this.ctx.settings.wikiFolder}/${folder}/${slug}.md`;

    // Fast path: exact slug match (same type folder)
    const existing = await this.ctx.tryReadFile(slugPath);
    if (existing !== null) {
      // Check for historical cross-type duplicate: if the same name exists in the
      // opposite folder, it means an earlier ingestion classified this item differently.
      // Append the new name as an alias to bridge the two pages (Bug #1 fix).
      const otherSlugPath = `${this.ctx.settings.wikiFolder}/${otherFolder}/${slug}.md`;
      const otherExisting = await this.ctx.tryReadFile(otherSlugPath);
      if (otherExisting !== null) {
        console.warn(`Historical cross-type duplicate detected: ${folder}/${slug}.md and ${otherFolder}/${slug}.md both exist — appending alias`);
        await this.appendAliases(otherSlugPath, [name]);
      }
      return { path: slugPath };
    }

    // Fast path 2 + Slow path: share sameTypePages across slug-match and LLM resolution
    try {
      const allPages = await getExistingWikiPages(this.ctx.app, this.ctx.settings.wikiFolder);

      // Use ConflictResolver for deterministic slug/alias matching before LLM fallback.
      const resolver = new ConflictResolver(this.ctx.settings.wikiFolder, allPages);
      const cr = resolver.resolve({ name, slug, pageType });

      if (cr.action === 'merge' && !cr.reason.includes('Cross-type')) {
        await this.appendAliases(cr.targetPath, [name]);
        return { path: cr.targetPath };
      }

      if (cr.action === 'merge' && cr.reason.includes('Cross-type')) {
        await this.appendAliases(cr.targetPath, [name]);
        return {
          path: null,
          collision: {
            name,
            sourceType: pageType,
            targetType: cr.existingType || (otherFolder === WIKI_SUBFOLDERS.entities ? 'entity' : 'concept'),
            targetPath: cr.targetPath
          }
        };
      }

      const sameTypePages = allPages
        .filter(p => p.path.includes(`/${folder}/`))
        .filter(p => {
          // Purge polluted entries from LLM input (L2)
          const bn = p.title || '';
          return !/^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/.test(bn);
        });

      // Same-type slug/alias match is handled above by ConflictResolver.
      // Remaining path: LLM-based semantic dedup for pages that don't match by slug/alias.

      if (sameTypePages.length === 0) return { path: slugPath };

      const pagesList = sameTypePages
        .map(p => {
          const aliasBlock = p.aliases?.length
            ? `\n  aliases: ${p.aliases.join(', ')}`
            : '';
          return `- path: ${p.path}\n  title: ${p.title}${aliasBlock}`;
        })
        .join('\n');

      const client = this.ctx.getClient();
      if (!client) return { path: slugPath };

      const prompt = PROMPTS.resolveEntityDedup
        .replace('{{wikiFolder}}', this.ctx.settings.wikiFolder)
        .replace('{{entity_name}}', name)
        .replace('{{entity_type}}', pageType)
        .replace('{{entity_summary}}', summary.substring(0, 300))
        .replace('{{page_type}}', pageType)
        .replace('{{existing_pages}}', pagesList);

      const response = await client.createMessage({
        model: this.ctx.settings.model,
        max_tokens: TOKENS_DEDUP_RESOLUTION,
        system: await this.ctx.buildSystemPrompt('full'),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      ...(this.ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });

      const result = await parseJsonResponse(response) as {
        match?: boolean;
        path?: string | null;
      } | null;

      if (result?.match && result?.path) {
        result.path = normalizeLLMPath(result.path, this.ctx.settings.wikiFolder);
        console.debug(`Entity resolution: "${name}" matched existing page "${result.path}"`);
        // Append the new name as an alias to the existing page to prevent future duplicates
        await this.appendAliases(result.path, [name]);
        return { path: result.path };
      }
    } catch (error) {
      console.debug(`Entity resolution for "${name}" failed, using slug path:`, error);
    }

    return { path: slugPath };
  }

  async buildPagesListForPrompt(includePaths: string[] = []): Promise<string> {
    const allPages = await getExistingWikiPages(this.ctx.app, this.ctx.settings.wikiFolder);
    // Filter out pages with polluted basenames before showing to LLM (L2)
    const cleanPages = allPages.filter(p => {
      const bn = p.title || '';
      return !/^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/.test(bn);
    });
    const MAX_PAGES = 50;
    let pages = cleanPages;
    let truncated = false;
    if (cleanPages.length > MAX_PAGES) {
      const hasEntityExtra = includePaths.some(p => p.includes('/entities/'));
      const hasConceptExtra = includePaths.some(p => p.includes('/concepts/'));
      if (hasEntityExtra && !hasConceptExtra) {
        pages = allPages.filter(p => p.path.includes('/entities/')).slice(0, MAX_PAGES);
      } else if (hasConceptExtra && !hasEntityExtra) {
        pages = allPages.filter(p => p.path.includes('/concepts/')).slice(0, MAX_PAGES);
      } else {
        pages = allPages.slice(0, MAX_PAGES);
      }
      truncated = true;
    }
    const list = pages.map(p => {
      const aliasSuffix = p.aliases?.length ? ` \`aliases: ${p.aliases.join(', ')}\`` : '';
      return `- ${p.wikiLink}${aliasSuffix}`;
    }).join('\n');
    let result = list;
    if (includePaths.length > 0) {
      const newPages = includePaths.map(p => {
        const relPath = p.replace(this.ctx.settings.wikiFolder + '/', '').replace('.md', '');
        const name = relPath.split('/').pop() || relPath;
        return `- [[${relPath}|${name}]]`;
      }).filter(entry => !list.includes(entry));
      if (newPages.length > 0) {
        result = list + '\n' + newPages.join('\n');
      }
    }
    if (truncated) {
      result += `\n(Wiki has ${allPages.length} pages total; showing first ${MAX_PAGES}. See index.md for the full list.)`;
    }
    return result;
  }

  async createOrUpdateEntityPage(
    entity: EntityInfo,
    _analysis: SourceAnalysis,
    sourceFile: TFile | { path: string; basename: string },
    extraPagePaths: string[] = []
  ): Promise<PageCreationResult> {
    return this.createOrUpdatePage(entity, 'entity', sourceFile, extraPagePaths);
  }

  async createOrUpdateConceptPage(
    concept: ConceptInfo,
    _analysis: SourceAnalysis,
    sourceFile: TFile | { path: string; basename: string },
    extraPagePaths: string[] = []
  ): Promise<PageCreationResult> {
    return this.createOrUpdatePage(concept, 'concept', sourceFile, extraPagePaths);
  }

  // ── Generic page CRUD (entity/concept unified) ──────────────────────

  private async createOrUpdatePage(
    info: EntityInfo | ConceptInfo,
    pageType: 'entity' | 'concept',
    sourceFile: TFile | { path: string; basename: string },
    extraPagePaths: string[] = []
  ): Promise<PageCreationResult> {
    if (!info.name || info.name.trim().length === 0) {
      console.warn(`${pageType} name is empty, skipping creation`);
      return { path: null };
    }

    console.debug(`=== Creating/Updating ${pageType} page ===`);
    console.debug('name:', info.name);
    console.debug('type:', info.type);

    const result = await this.resolvePagePath(info.name, pageType, info.summary);
    if (result.path === null) {
      if (result.collision) {
        // Cross-type collision: a page for this item already exists in the opposite
        // folder. Don't create a duplicate file, but merge the new content into the
        // existing page so the source's summary/mentions/sources aren't lost.
        // Use the EXISTING page's type for the merge so it keeps its classification.
        const { targetPath, targetType } = result.collision;
        const existingContent = await this.ctx.tryReadFile(targetPath);
        if (existingContent) {
          const isReviewed = parseFrontmatter(existingContent)?.reviewed === true;
          if (isReviewed) {
            await this.appendToReviewedPage(info, sourceFile, existingContent, targetPath);
          } else {
            await this.mergePage(info, targetType, sourceFile, existingContent, extraPagePaths, targetPath);
          }
          console.debug(`Cross-type collision: merged "${info.name}" content into ${targetType} page ${targetPath}`);
        }
      }
      return result;
    }
    console.debug('Resolved path:', result.path);

    const existingContent = await this.ctx.tryReadFile(result.path);

    if (!existingContent) {
      const createdPath = await this.createNewPage(info, pageType, sourceFile, extraPagePaths, result.path);
      return { path: createdPath };
    }

    const isReviewed = parseFrontmatter(existingContent)?.reviewed === true;

    if (isReviewed) {
      console.debug(`${pageType} page has reviewed: true, using minimal append mode:`, result.path);
      const updatedPath = await this.appendToReviewedPage(info, sourceFile, existingContent, result.path);
      return { path: updatedPath };
    }

    const mergedPath = await this.mergePage(info, pageType, sourceFile, existingContent, extraPagePaths, result.path);
    return { path: mergedPath };
  }

  private async createNewPage(
    info: EntityInfo | ConceptInfo,
    pageType: 'entity' | 'concept',
    sourceFile: TFile | { path: string; basename: string },
    extraPagePaths: string[],
    path: string
  ): Promise<string | null> {
    const client = this.ctx.getClient();
    if (!client) throw new Error('LLM client not initialized');

    try {
      const generatePrompt = pageType === 'entity' ? PROMPTS.generateEntityPage : PROMPTS.generateConceptPage;
      const sourcePageRef = getGeneratedSourcePageRef(sourceFile, this.ctx.settings);
      const role = normalizeExtractionRole(info, pageType);
      const centrality = normalizeExtractionCentrality(info, role, pageType);

    const prompt = generatePrompt
      .replace('{{entity_name}}', info.name)
      .replace('{{concept_name}}', info.name)
      .replace('{{entity_type}}', info.type)
      .replace('{{concept_type}}', info.type)
      .replace(/{{role}}/g, role)
      .replace(/{{centrality}}/g, centrality)
      .replace(/{{page_worthiness_reason}}/g, info.page_worthiness_reason || 'Reusable source-backed Wiki anchor.')
      .replace('{{entity_summary}}', info.summary)
      .replace('{{concept_summary}}', info.summary)
      .replace('{{extraction_aliases}}', info.aliases?.length
        ? `[${info.aliases.join(', ')}]` : 'None')
      .replace('{{mentions}}', truncateMentions(info.mentions_in_source, 500, sourcePageRef) || 'No specific mentions')
      .replace('{{related_entities}}', info.related_entities?.join(', ') || 'No related entities')
      .replace('{{related_concepts}}', info.related_concepts?.join(', ') || 'No related concepts')
      .replace('{{existing_pages}}', await this.buildPagesListForPrompt(extraPagePaths))
      .replace('{{related_content}}', 'No existing content')
      .replace('{{merge_strategy}}', 'New page, no merge needed.')
      .replace('{{date}}', new Date().toISOString().split('T')[0])
      .replace(/{{source_page}}/g, sourcePageRef)
      .replace(/{{source_path}}/g, sourceFile.path);

    const finalPrompt = applySectionLabels(prompt, this.ctx.settings);

    const pageContent = await client.createMessage({
      model: this.ctx.settings.model,
      max_tokens: TOKENS_PAGE_GENERATION,
      system: await this.ctx.buildSystemPrompt(pageType),
      messages: [{ role: 'user', content: finalPrompt }],
      ...(this.ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });

    const cleanedContent = cleanMarkdownResponse(pageContent);
    // Issue #85: pass settings so custom tag vocabulary is honored
    const enforcedContent = enforceFrontmatterConstraints(cleanedContent, pageType, this.ctx.settings);
    const allowedTargets = await buildAllowedWikiLinkTargets(this.ctx, path, sourcePageRef);
    const finalContent = sanitizeWikiLinksToAllowedTargets(enforcedContent, allowedTargets);
    await this.ctx.createOrUpdateFile(path, finalContent);
    return path;
    } catch (error) {
      throw contextualizeError(error, info.name, pageType);
    }
  }

  private async mergePage(
    info: EntityInfo | ConceptInfo,
    pageType: 'entity' | 'concept',
    sourceFile: TFile | { path: string; basename: string },
    existingContent: string,
    extraPagePaths: string[],
    path: string
  ): Promise<string | null> {
    const client = this.ctx.getClient();
    if (!client) throw new Error('LLM client not initialized');

    try {
      // 1. Programmatic frontmatter merge
      const sourcePageRef = getGeneratedSourcePageRef(sourceFile, this.ctx.settings);
      const role = normalizeExtractionRole(info, pageType);
      const centrality = normalizeExtractionCentrality(info, role, pageType);
      const { frontmatter, body: existingBody } = mergeFrontmatter(existingContent, sourcePageRef, { role, centrality });

    // 2. LLM intelligent body merge
    const mergePrompt = pageType === 'entity' ? PROMPTS.mergeEntityPage : PROMPTS.mergeConceptPage;

    const prompt = mergePrompt
      .replace('{{existing_body}}', existingBody)
      .replace('{{new_source}}', sourceFile.basename)
      .replace('{{entity_summary}}', info.summary)
      .replace('{{concept_summary}}', info.summary)
      .replace('{{mentions}}', truncateMentions(info.mentions_in_source, 500, sourcePageRef))
      .replace('{{related_entities}}', info.related_entities?.join(', ') || '')
      .replace('{{related_concepts}}', info.related_concepts?.join(', ') || '')
      .replace('{{key_details}}', info.mentions_in_source?.slice(0, 2).join('; ') || '')
      .replace('{{existing_pages}}', await this.buildPagesListForPrompt(extraPagePaths));

    const finalPrompt = applySectionLabels(prompt, this.ctx.settings);

    const mergedBody = await client.createMessage({
      model: this.ctx.settings.model,
      max_tokens: TOKENS_PAGE_GENERATION,
      system: await this.ctx.buildSystemPrompt('merge'),
      messages: [{ role: 'user', content: finalPrompt }],
      ...(this.ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });

    const cleanedBody = cleanMarkdownResponse(mergedBody);

    if (cleanedBody.trim() === 'NO_NEW_CONTENT') {
      console.debug(`${pageType} page merge returned NO_NEW_CONTENT, keeping existing:`, path);
      return path;
    }

    // 3. Assemble final content
    const finalContent = `${frontmatter}\n\n${cleanedBody}`;
    const allowedTargets = await buildAllowedWikiLinkTargets(this.ctx, path, sourcePageRef);
    await this.ctx.createOrUpdateFile(path, sanitizeWikiLinksToAllowedTargets(finalContent, allowedTargets));
    return path;
    } catch (error) {
      throw mergeError(error, info.name, pageType);
    }
  }

  private async appendToReviewedPage(
    info: EntityInfo | ConceptInfo,
    sourceFile: TFile | { path: string; basename: string },
    existingContent: string,
    path: string
  ): Promise<string | null> {
    const client = this.ctx.getClient();
    if (!client) throw new Error('LLM client not initialized');

    try {
      // 1. Programmatic frontmatter merge
      const sourcePageRef = getGeneratedSourcePageRef(sourceFile, this.ctx.settings);
      const role = normalizeExtractionRole(info, parseFrontmatter(existingContent)?.type === 'entity' ? 'entity' : 'concept');
      const centrality = normalizeExtractionCentrality(info, role, parseFrontmatter(existingContent)?.type === 'entity' ? 'entity' : 'concept');
      const { frontmatter, body: existingBody } = mergeFrontmatter(existingContent, sourcePageRef, { role, centrality });

    // 2. Minimal LLM check for genuinely new content
    const prompt = PROMPTS.appendToReviewedPage
      .replace('{{existing_body}}', existingBody)
      .replace('{{new_source}}', sourceFile.basename)
      .replace('{{entity_summary}}', info.summary)
      .replace('{{mentions}}', truncateMentions(info.mentions_in_source, 500, sourcePageRef))
      .replace('{{key_details}}', info.mentions_in_source?.slice(0, 2).join('; ') || '')
      .replace('{{constraints}}', UNIVERSAL_LINK_CONSTRAINTS);

    const finalPrompt = applySectionLabels(prompt, this.ctx.settings);

    const newContent = await client.createMessage({
      model: this.ctx.settings.model,
      max_tokens: TOKENS_APPEND_REVIEWED,
      system: await this.ctx.buildSystemPrompt('merge'),
      messages: [{ role: 'user', content: finalPrompt }],
      ...(this.ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });

    const cleanedContent = cleanMarkdownResponse(newContent);

    if (cleanedContent.trim() === 'NO_NEW_CONTENT') {
      console.debug('Reviewed page has no new content, preserving existing:', path);
      return path;
    }

    // 3. Assemble final content
    const finalContent = `${frontmatter}\n\n${cleanedContent}`;
    const allowedTargets = await buildAllowedWikiLinkTargets(this.ctx, path, sourcePageRef);
    await this.ctx.createOrUpdateFile(path, sanitizeWikiLinksToAllowedTargets(finalContent, allowedTargets));
    return path;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update reviewed page "${info.name}": ${msg}`);
    }
  }

  async updateRelatedPage(pageName: string, analysis: SourceAnalysis, sourceFile: TFile | { path: string; basename: string }): Promise<boolean> {
    const existingPages = await getExistingWikiPages(this.ctx.app, this.ctx.settings.wikiFolder);
    const page = existingPages.find(p => p.title === pageName);

    if (!page) {
      console.debug('Related page not found:', pageName);
      return false;
    }

    const abstractFile = this.ctx.app.vault.getAbstractFileByPath(page.path);
    if (!(abstractFile instanceof TFile)) {
      console.debug('Related page is not a file:', pageName);
      return false;
    }

    const existingContent = await this.ctx.app.vault.read(abstractFile);

    // 1. Programmatic frontmatter merge (sources + updated)
    const sourcePageRef = getGeneratedSourcePageRef(sourceFile, this.ctx.settings);
    const { frontmatter, body: existingBody } = mergeFrontmatter(existingContent, sourcePageRef);

    // Issue #131: a "related page" is an existing page topically related to the
    // source — a different set from the entities/concepts this source extracted.
    // When the source extracted nothing matching this page, there is no new body
    // content to weave in; the previous behaviour regenerated the whole body via
    // the LLM anyway (a no-op rewrite that wastes a call and re-rolls verbatim
    // text through the model, a known corruption vector). Skip the LLM entirely:
    // record the new source in frontmatter and leave the body untouched.
    const newInfo = analysis.entities.find(e => e.name === pageName) || analysis.concepts.find(c => c.name === pageName);
    if (!newInfo) {
      await this.ctx.createOrUpdateFile(page.path, `${frontmatter}\n\n${existingBody}`);
      return true;
    }

    const prompt = PROMPTS.updateRelatedPage
      .replace('{{page_name}}', pageName)
      .replace('{{existing_body}}', existingBody)
      .replace('{{source_basename}}', sourceFile.basename)
      .replace('{{new_info}}', JSON.stringify(newInfo))
      .replace('{{constraints}}', UNIVERSAL_LINK_CONSTRAINTS);

    const client = this.ctx.getClient();
    if (!client) throw new Error('LLM client not initialized');

    const updatedBody = await client.createMessage({
      model: this.ctx.settings.model,
      max_tokens: TOKENS_PAGE_GENERATION,
      system: await this.ctx.buildSystemPrompt('related'),
      messages: [{ role: 'user', content: prompt }],
      ...(this.ctx.settings.disableThinking ? { enableThinking: false } : {}),
    });

    const cleanedBody = cleanMarkdownResponse(updatedBody);

    // 2. Assemble: programmatic frontmatter + LLM body
    const finalContent = `${frontmatter}\n\n${cleanedBody}`;
    const allowedTargets = await buildAllowedWikiLinkTargets(this.ctx, page.path, sourcePageRef);
    await this.ctx.createOrUpdateFile(page.path, sanitizeWikiLinksToAllowedTargets(finalContent, allowedTargets));
    return true;
  }
}
