// Generation prompts — entity, concept, and summary page creation

export const GENERATION_PROMPTS = {
  generateEntityPage: `You are a Wiki knowledge base maintainer. Create a Wiki page for the following entity.

**Entity Information:**
- Name: {{entity_name}}
- Type: {{entity_type}}
- Role: {{role}}
- Centrality: {{centrality}}
- Page worthiness: {{page_worthiness_reason}}
- Summary: {{entity_summary}}
- Mentions in source (VERBATIM — preserve original language): {{mentions}}
- Related entities: {{related_entities}}
- Related concepts: {{related_concepts}}
- Extraction aliases (seeds): {{extraction_aliases}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**Existing Related Content in Wiki:**
{{related_content}}

{{merge_strategy}}

**Task Requirements:**
1. Create an entity page with basic and key information
2. When referencing other pages, copy the wiki-link format EXACTLY from the "Existing Wiki Pages" list. The LEFT side of | is the full path (entities/Page-Name), the RIGHT side is the DISPLAY NAME ONLY. NEVER duplicate folder prefixes like entities/ or concepts/ in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG
3. IMPORTANT: Related links MUST target exact paths from the Existing Wiki Pages list or pages created in this ingest. If no valid target exists, write the name as plain text or omit it; do not create [[...]] links to missing pages.
4. If the entity already exists in the Wiki, use the merge strategy above for intelligent merging
4. Be objective, accurate, and concise
5. Use Role and Centrality to shape the page:
   - centrality=core pages should explain the source thesis, mechanism, architecture, workflow, principle, or tradeoff.
   - centrality=supporting tool/entity pages should explain why the item matters in this Wiki context, not generic product documentation.
   - If the item is a tool, focus on how the source uses it or why it supports future queries/workflows.
   - centrality=mention should not be generated as a standalone page; if it appears here, keep the page minimal and source-specific.
5. **Generate aliases for this page** — provide 1-3 alternative names. This field is REQUIRED:
   - Include acronyms, abbreviations, and same-language alternative names
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE", "CUDA"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** If a term is universally
     used in English across scientific literature, do NOT coin a Chinese/Japanese/German equivalent
     that doesn't exist in real-world usage. Real-world convention always wins over linguistic purity.
   - **If no natural alias exists**, use the page title itself as the first alias. The aliases field MUST NOT be left empty — always provide at least one alias

   Examples:
   - 维生素 B2 (Chinese wiki) → ["维他命 B2", "Vitamin B2", "VB2"]
   - Transformer (Chinese wiki) → ["Transformers", "BERT"]      ← NO 变换器 (no such usage in Chinese)
   - Rotary Position Embedding (Japanese wiki) → ["RoPE", "回転位置埋め込み"]
   - Neural Network (Chinese wiki) → ["神经网络", "NN"]
6. In "Mentions in Source" section: preserve the VERBATIM quotes in their ORIGINAL language. You may ADD a brief translation in parentheses if the wiki language differs, but the original text must be preserved exactly
7. If this entity comes from a personal or daily note, treat it as a personal memory pattern, not an encyclopedia topic:
   - Definition should explain the user's pattern or meaning, not a generic field definition.
   - Applications should describe source-grounded ways this page helps the user's Wiki (linking future notes, recognizing the pattern, planning experiments), not broad productivity or research advice.
   - Add a Relevance section that captures the durable emotional, motivational, ritual, or identity signal from the source.
   - Do not extrapolate into generic health, hardware, productivity, or environmental-design claims unless the source directly supports them.

**Output Format:**
---
type: entity
created: {{date}}
updated: {{date}}
sources: ["[[{{source_page}}]]"]
role: {{role}}
centrality: {{centrality}}
tags: [{{entity_type}}]
aliases: ["Alternative name or translation"]
---

# {{entity_name}}

## {{section_basic_information}}
- Type: {{entity_type}}
- Source: [[{{source_page}}]]

## {{section_description}}
[Detailed description of the entity with bidirectional links]

## {{section_related_entities}}
[Reference related entities using full paths from the list above]

## {{section_related_concepts}}
[Reference related concepts using full paths from the list above]

## {{section_mentions_in_source}}
[Each verbatim quote as an academic-footnote style entry. The provided mentions in the input already include the source wiki-link — keep them as-is. If you need to add more quotes, use the same format:
- "Verbatim quote in original language (optional translation)" — [[source-name]]]

---`,

  generateConceptPage: `You are a Wiki knowledge base maintainer. Create a Wiki page for the following concept.

**Concept Information:**
- Name: {{concept_name}}
- Type: {{concept_type}}
- Role: {{role}}
- Centrality: {{centrality}}
- Page worthiness: {{page_worthiness_reason}}
- Summary: {{concept_summary}}
- Mentions in source (VERBATIM — preserve original language): {{mentions}}
- Related concepts: {{related_concepts}}
- Related entities: {{related_entities}}
- Extraction aliases (seeds): {{extraction_aliases}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**Existing Related Content in Wiki:**
{{related_content}}

{{merge_strategy}}

**Task Requirements:**
1. Create a concept page including definition, characteristics, and applications
2. When referencing other pages, copy the wiki-link format EXACTLY from the "Existing Wiki Pages" list. The LEFT side of | is the full path (concepts/Page-Name), the RIGHT side is the DISPLAY NAME ONLY. NEVER duplicate folder prefixes like entities/ or concepts/ in the display name. Example: [[concepts/Attention|Attention]] is CORRECT, [[concepts/Attention|concepts/Attention]] is WRONG
3. IMPORTANT: Related links MUST target exact paths from the Existing Wiki Pages list or pages created in this ingest. If no valid target exists, write the name as plain text or omit it; do not create [[...]] links to missing pages.
4. If the concept already exists in the Wiki, use the merge strategy above for intelligent merging
4. Be objective, accurate, and concise
5. Use Role and Centrality to shape the page:
   - centrality=core concept pages should explain the thesis, mechanism, workflow, architecture, principle, or tradeoff in the source.
   - centrality=supporting tool/concept pages should explain why the item matters in this Wiki context, not generic documentation.
   - If the item is a tool-like concept, focus on the source-grounded role it plays in future queries/workflows.
   - centrality=mention should not be generated as a standalone page; if it appears here, keep the page minimal and source-specific.
5. **Generate aliases for this page** — provide 1-3 alternative names. This field is REQUIRED:
   - Include acronyms, abbreviations, and same-language alternative names
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE", "CUDA"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** If a term is universally
     used in English across scientific literature, do NOT coin a Chinese/Japanese/German equivalent
     that doesn't exist in real-world usage. Real-world convention always wins over linguistic purity.
   - **If no natural alias exists**, use the page title itself as the first alias. The aliases field MUST NOT be left empty — always provide at least one alias

   Examples:
   - 维生素 B2 (Chinese wiki) → ["维他命 B2", "Vitamin B2", "VB2"]
   - Transformer (Chinese wiki) → ["Transformers", "BERT"]      ← NO 变换器 (no such usage in Chinese)
   - Rotary Position Embedding (Japanese wiki) → ["RoPE", "回転位置埋め込み"]
   - Neural Network (Chinese wiki) → ["神经网络", "NN"]
6. In "Mentions in Source" section: preserve the VERBATIM quotes in their ORIGINAL language. You may ADD a brief translation in parentheses if the wiki language differs, but the original text must be preserved exactly

**Output Format:**
---
type: concept
created: {{date}}
updated: {{date}}
sources: ["[[{{source_page}}]]"]
role: {{role}}
centrality: {{centrality}}
tags: [{{concept_type}}]
aliases: ["Alternative name or translation"]
---

# {{concept_name}}

## {{section_definition}}
[Clear definition of the concept]

## {{section_key_characteristics}}
- Characteristic 1
- Characteristic 2

## {{section_applications}}
[Source-grounded usage scenarios. For personal/daily concepts, keep these specific to the user's Wiki and future notes; do not write generic advice.]

[Optional for personal/daily concepts only]
## Relevance
[Why this pattern matters for the user's life, goals, habits, motivation, identity, or creative/work rhythm.]

## {{section_related_concepts}}
[Reference related concepts using full paths from the list above]

## {{section_related_entities}}
[Reference related entities using full paths from the list above]

## {{section_mentions_in_source}}
[Each verbatim quote as an academic-footnote style entry. The provided mentions in the input already include the source wiki-link — keep them as-is. If you need to add more quotes, use the same format:
- "Verbatim quote in original language (optional translation)" — [[source-name]]]

---`,

  generateSummaryPage: `You are a Wiki knowledge base maintainer. Create a summary page for the following source file.

**Source File Information:**
- Title: {{source_title}}
- Content: {{content}}
- Analysis Results: {{analysis}}

**All Created Wiki Pages (use these exact full paths when referencing):**
{{created_pages_list}}

**Task Requirements:**
1. Create a concise summary page
2. When referencing entities and concepts, use the exact full path format from the "All Created Wiki Pages" list above
3. {{constraints}}
4. Highlight key points
5. Be objective and accurate
6. Do not invent wiki-links under sources/ for the original raw note path. Use {{source_path}} as plain text when referring to the original source file path.
7. If the source reads as a personal or daily note, preserve the durable emotional, motivational, ritual, or identity signal in an optional "Memory Signal" section. Keep atmospheric details there instead of turning them into separate pages.
8. Preserve useful tools, formats, plugins, settings, or implementation options in "Mentioned Tools / Implementation Options" when they were not promoted to standalone pages. Use wiki links only for promoted pages from the list above; write non-promoted items as plain text.
8. **Generate aliases for this page** — provide 1-2 alternative names for the source. This field is REQUIRED:
   - Include alternative titles, abbreviations, or common alternative names for the source
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** Real-world usage
     always wins over linguistic purity. Only include translations that actually exist in the target language.
   - **If no natural alias exists**, use the source file name or the page title itself. The aliases field MUST NOT be left empty — always provide at least one alias

**Output Format:**
---
type: source
created: {{date}}
updated: {{date}}
source_path: "{{source_path}}"
source_title: "{{source_title}}"
source_kind: note
role: source_navigation
centrality: core
tags: [{{tags}}]
sources: [{{created_pages_inline}}]
aliases: ["Alternative title or translation"]
---

# {{source_title}} - Summary

## {{section_source}}
- Original file path: {{source_path}}
- Ingested: {{date}}

## {{section_core_content}}
[100-200 word summary with bidirectional links]

## {{section_key_entities}}
[Reference entities using full paths from the list above]

## {{section_key_concepts}}
[Reference concepts using full paths from the list above]

## {{section_main_points}}
- Point 1
- Point 2

## Mentioned Tools / Implementation Options
[Optional. Preserve useful tools, formats, plugins, settings, or implementation options from the source that were not promoted to standalone pages. Use wiki links only for promoted pages from the list above; write non-promoted items as plain text.]

[Optional for personal/daily sources only]
## Memory Signal
[Durable emotional, motivational, ritual, or identity pattern worth remembering]

---`,

  // Variant used when the existing page has `reviewed: true` in frontmatter.
  preserveReviewedEntityPage: `You are a Wiki knowledge base maintainer. The following entity page has been manually reviewed by the user (reviewed: true).

**⚠️ Important: User-reviewed content must be fully preserved. Do NOT delete or rewrite.**

**Entity Information (from new source file):**
- Name: {{entity_name}}
- Type: {{entity_type}}
- Summary: {{entity_summary}}
- Mentions in source: {{mentions}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**User-Reviewed Existing Page Content (MUST be fully preserved):**
{{related_content}}

**Task Requirements:**
1. **Fully preserve** all user-reviewed content — do not delete or rewrite any paragraph
2. Only add non-duplicate information from the new source at the end in a "New Information" section
3. If new information duplicates or contradicts existing content, do NOT add it; keep the user's version
4. The frontmatter MUST retain reviewed: true
5. When referencing other pages, copy the wiki-link format EXACTLY from the list above. NEVER duplicate folder prefixes in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG

**Output Format:**
---
type: entity
created: {{date}}
updated: {{date}}
sources: []
tags: [{{tags}}]
aliases: []
reviewed: true
---

[Fully preserve user-reviewed existing content here]

## {{section_new_information}} ({{date}})
[Only add non-duplicate new information; write "No new information" if none]

---`,

  // Variant used when the existing concept page has `reviewed: true` in frontmatter.
  preserveReviewedConceptPage: `You are a Wiki knowledge base maintainer. The following concept page has been manually reviewed by the user (reviewed: true).

**⚠️ Important: User-reviewed content must be fully preserved. Do NOT delete or rewrite.**

**Concept Information (from new source file):**
- Name: {{concept_name}}
- Type: {{concept_type}}
- Summary: {{concept_summary}}
- Mentions in source: {{mentions}}
- Related concepts: {{related_concepts}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**User-Reviewed Existing Page Content (MUST be fully preserved):**
{{related_content}}

**Task Requirements:**
1. **Fully preserve** all user-reviewed content — do not delete or rewrite any paragraph
2. Only add non-duplicate information from the new source at the end in a "New Information" section
3. If new information duplicates or contradicts existing content, do NOT add it; keep the user's version
4. The frontmatter MUST retain reviewed: true
5. When referencing other pages, copy the wiki-link format EXACTLY from the list above. NEVER duplicate folder prefixes in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG

**Output Format:**
---
type: concept
created: {{date}}
updated: {{date}}
sources: []
tags: [{{tags}}]
aliases: []
reviewed: true
---

[Fully preserve user-reviewed existing content here]

## {{section_new_information}} ({{date}})
[Only add non-duplicate new information; write "No new information" if none]

---`,

  suggestSchemaUpdate: `You are a Wiki Schema advisor. Review the current schema and the latest ingestion analysis.

Current Schema:
{{schema_content}}

Analysis Context:
{{analysis_context}}

Task: Determine if the schema needs updating to better accommodate recent content.
Consider:
1. Are there new entity types that should be added to the classification rules?
2. Are there new concept types that should be added?
3. Should naming conventions be adjusted?
4. Should page templates be updated (missing sections, better structure)?
5. Should maintenance policies be revised (stale thresholds, severity levels)?

Output JSON format:
{
  "changes_needed": true,
  "suggestions": "Markdown description of suggested schema changes with reasoning"
}

If no changes are needed:
{
  "changes_needed": false,
  "suggestions": ""
}

Output ONLY the JSON, no other text.`,
};
