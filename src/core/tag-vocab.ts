import { VALID_ENTITY_TAGS, VALID_CONCEPT_TAGS, VALID_SOURCE_TAGS, LLMWikiSettings } from '../types';

export function getActiveEntityTags(settings: LLMWikiSettings): string[] {
  const custom = (settings.customEntityTags ?? '').trim();
  if (settings.tagVocabularyMode === 'custom' && custom.length > 0) {
    const userTags = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
    return Array.from(new Set(userTags));
  }
  return [...VALID_ENTITY_TAGS];
}

export function getActiveConceptTags(settings: LLMWikiSettings): string[] {
  const custom = (settings.customConceptTags ?? '').trim();
  if (settings.tagVocabularyMode === 'custom' && custom.length > 0) {
    const userTags = custom.split(',').map(t => t.trim()).filter(t => t.length > 0);
    return Array.from(new Set(userTags));
  }
  return [...VALID_CONCEPT_TAGS];
}

export function getActiveSourceTags(settings: LLMWikiSettings): string[] {
  return [...VALID_SOURCE_TAGS];
}

export function normalizeVocabularyCsv(csv: string): string {
  if (!csv) return '';
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of csv.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.join(', ');
}
