// Universal prompt constraints injected into all generation/merge prompts.
// Centralizing these rules ensures consistency across all LLM interactions
// and eliminates the need to remember them when adding new prompts.
// See: Issue #63, PR #63 audit recommendations.

export const UNIVERSAL_LINK_CONSTRAINTS = `LINK RULES (apply to ALL body text output):
- Use [[sources/...]] only for source attribution lines such as Source or Mentions in Source; do not use sources/ as a related entity/concept link
- NEVER duplicate folder prefixes in display names: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG
- ONLY use [[entities/...]] or [[concepts/...]] links that are present in the provided Existing/Created pages list
- Do not create [[...]] links for missing pages; use plain text or omit the relationship`;
