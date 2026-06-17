import { LLMWikiSettings } from '../../types';
import { getSectionLabels } from '../system-prompts';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSectionLabelsHint(settings: LLMWikiSettings): string {
  const labels = getSectionLabels(settings);
  const entityLabels = [
    `- ${labels.basic_information}`,
    `- ${labels.description}`,
    `- ${labels.related_entities}`,
    `- ${labels.related_concepts}`,
    `- ${labels.mentions_in_source}`,
  ].join('\n');
  const conceptLabels = [
    `- ${labels.definition}`,
    `- ${labels.key_characteristics}`,
    `- ${labels.applications}`,
    `- ${labels.related_concepts}`,
    `- ${labels.related_entities}`,
    `- ${labels.mentions_in_source}`,
  ].join('\n');
  const sourceLabels = [
    `- ${labels.source}`,
    `- ${labels.core_content}`,
    `- ${labels.key_entities}`,
    `- ${labels.key_concepts}`,
    `- ${labels.main_points}`,
  ].join('\n');
  return `Entity pages use:\n${entityLabels}\n\nConcept pages use:\n${conceptLabels}\n\nSource pages use:\n${sourceLabels}`;
}

export function normalizeFrontmatterDates(content: string, dateStr: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  const fmContent = fmMatch[1];
  const hasUpdated = /^updated:\s*.+$/m.test(fmContent);

  let newFm: string;
  if (hasUpdated) {
    newFm = fmContent.replace(/^updated:\s*.+$/m, `updated: ${dateStr}`);
  } else {
    newFm = fmContent + `\nupdated: ${dateStr}`;
  }

  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}\n---`);
}

export function fixDoubleNestedWikiLinks(content: string): { fixed: number; content: string } {
  let fixed = 0;
  const doubleNestRegex = /\[\[\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]\]\]/g;
  const result = content.replace(doubleNestRegex, (_fullMatch, target: string, display?: string) => {
    fixed++;
    if (display) {
      return `[[${target}|${display}]]`;
    }
    return `[[${target}]]`;
  });
  return { fixed, content: result };
}

export const EMPTY_CONTENT_STRIP = /[#*\-_>\s\n[\]|—]/g;
export const MIN_SUBSTANTIVE_CHARS = 50;
export const STUB_MARKER = 'Auto-generated stub page';

export function isPageEmpty(content: string): boolean {
  if (content.includes(STUB_MARKER)) return true;

  const textBody = content
    .replace(/---[\s\S]*?---/, '')
    .replace(EMPTY_CONTENT_STRIP, '')
    .trim();
  return textBody.length < MIN_SUBSTANTIVE_CHARS;
}

export function detectPollutedPages(
  pages: Array<{ path: string; title: string }>
): Array<{ path: string; title: string; cleanTitle: string }> {
  const polluted: Array<{ path: string; title: string; cleanTitle: string }> = [];
  for (const p of pages) {
    const match = /^(entities|concepts|sources)([^\s\-_a-zA-Z0-9])/.exec(p.title);
    if (match) {
      polluted.push({
        path: p.path,
        title: p.title,
        cleanTitle: p.title.replace(/^(entities|concepts|sources)/, ''),
      });
    }
  }
  return polluted;
}
