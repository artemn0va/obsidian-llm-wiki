// Ingestion prompts — source analysis, entity resolution

export const INGESTION_PROMPTS = {
  analyzeSource: `You are a Wiki knowledge base maintainer. Analyze the following source file and output structured JSON.

**Existing Wiki pages — use ONLY these exact paths when creating [[links]]:**
{{existing_slugs}}

**Source File Content:**
{{content}}

{{batch_context}}

**Extraction Scope:**
{{granularity_instruction}}

**Task Requirements:**
0. [FIRST ROUND ONLY] Write a 100-200 word source summary (field: summary) and extract the source title (field: source_title). These fields must NOT appear in later rounds.
1. In EVERY round (including the first), output both "entities" and "concepts" arrays. Use [] when a category has no items. Never omit either array.
2. Optionally generate 1-2 aliases per entity/concept — alternative names, acronyms, translations, or common phrasings. Aliases serve as seeds for page generation and help the model avoid duplicate extractions in later rounds. The aliases field is OPTIONAL in extraction; skip it when no natural alias exists.
3. Output at most {{batch_size}} items (entities + concepts total) this round
3. Write a detailed, informative summary for each item (target 4-6 sentences). Include concrete information: what the entity/concept is, its role/significance in the source, key factual details, and how it relates to other items. Provide enough substance that the summary alone can seed a quality Wiki page
4. For mentions_in_source: quote 2-4 verbatim sentences from the source where this entity/concept appears or is discussed. These quotes are critical — they provide the downstream page generator with source-grounded evidence. Include surrounding context, not just the name mention
5. For related_entities and related_concepts: identify entities/concepts mentioned in the same context as this item. These should be other items extracted from this same source file
6. Identify contradictions or conflicts with the existing Wiki (only output contradictions in the first round)
7. Identify related existing Wiki pages (only output related_pages in the first round)
8. Generate key points from the source file (only output key_points in the first round)
9. Every entity/concept candidate MUST include extraction metadata: role, centrality, and page_worthiness_reason.

**Meaning-First, Noun-Aware Extraction:**
- Durable meaning units are primary: theses, mechanisms, workflows, architecture, principles, tradeoffs, source-of-truth models, synthesis loops, navigation systems, and reusable patterns.
- Useful nouns are still preserved, especially tools, products, projects, named standards, and named historical references, but they must not outrank the source's core meaning.
- Valid role values: core_idea, architecture, workflow, mechanism, principle, tradeoff, tool, source_navigation, historical_analogy, implementation_detail.
- Valid centrality values: core, supporting, mention.
- "Mention is searchable, page is reusable": centrality=mention items stay in the source page and MUST NOT become standalone entity/concept pages.
- Tools are preserved, but not automatically promoted. Promote a tool to centrality=supporting only when it helps future queries, workflows, implementation choices, or architecture understanding.
- Coarse extraction should prioritize centrality=core meaning units and allow only a small number of centrality=supporting tool anchors. Do not extract every tool, setting, hotkey, plugin, UI label, or incidental implementation detail.
- For abstract idea, methodology, architecture, or pattern notes, build the semantic backbone first. Examples of core pages: persistent wiki, raw sources as source of truth, schema-governed maintenance, ingest/query/lint workflow, index/log navigation, RAG vs persistent wiki.
- For tool mentions in such notes, qmd can be supporting when presented as search infrastructure; Marp can be supporting when presented as an output/presentation tool; Dataview can be supporting when used as durable query infrastructure. Otherwise keep them as plain text in the source page.
- Low-value implementation details such as attachment folder paths, hotkeys, graph view, "download images locally", one-off plugin settings, and ordinary nouns should be centrality=mention or omitted.

**Output Format (strict JSON, output only JSON, no explanatory text):**
{
  "source_title": "Source file title",
  "summary": "150-250 word source summary (first round only, omitted thereafter)",
  "entities": [
    {
      "name": "Entity name - use English for generated page titles; preserve exact proper names and keep original-language terms as aliases when useful",
      "type": "person|organization|project|product|event|place|other",
      "role": "core_idea|architecture|workflow|mechanism|principle|tradeoff|tool|source_navigation|historical_analogy|implementation_detail",
      "centrality": "core|supporting|mention",
      "page_worthiness_reason": "Why this entity deserves a reusable page, or why it is mention-only.",
      "aliases": ["Optional: 1-2 alternative names, abbreviations, or translations. Helps prevent duplicate extractions in later rounds.", "If provided, these will seed the page aliases."],
      "summary": "Detailed 4-6 sentence description with concrete facts: identity, role/significance, key attributes",
      "mentions_in_source": ["Verbatim sentence from source: '...'.", "Another verbatim quote: '...'."],
      "related_entities": ["Related entity names from this source"],
      "related_concepts": ["Related concept names from this source"]
    }
  ],
  "concepts": [
    {
      "name": "Concept name - use English for generated page titles; preserve exact proper names and keep original-language terms as aliases when useful",
      "type": "theory|method|field|phenomenon|standard|term|other",
      "role": "core_idea|architecture|workflow|mechanism|principle|tradeoff|tool|source_navigation|historical_analogy|implementation_detail",
      "centrality": "core|supporting|mention",
      "page_worthiness_reason": "Why this concept deserves a reusable page, or why it is mention-only.",
      "aliases": ["Optional: 1-2 alternative names, abbreviations, or translations. Helps prevent duplicate extractions in later rounds.", "If provided, these will seed the page aliases."],
      "summary": "Detailed 4-6 sentence description with concrete facts: definition, importance, relationships",
      "mentions_in_source": ["Verbatim sentence from source: '...'.", "Another verbatim quote: '...'."],
      "related_concepts": ["Related concept names from this source"],
      "related_entities": ["Related entity names from this source"]
    }
  ],
  "contradictions": [
    {
      "claim": "What the source file claims",
      "source_page": "Conflicting existing Wiki page [[page-name]]",
      "contradicted_by": "What that page claims",
      "resolution": "Suggested resolution"
    }
  ],
  "related_pages": ["Related existing Wiki page names — use ONLY the plain page name, NOT wiki-link format. Example: 'Machine Learning' not [[concepts/Machine Learning|Machine Learning]]"],
  "key_points": ["Key point 1", "Key point 2"]
}

**Entity Recognition Guide:**
- person: individual who is a significant SUBJECT of the source. Authors cited only as evidence sources ("Smith et al. found...") are NOT wiki-worthy entities
- organization: organization/institution (company, school, team, department, etc.)
- project: project/initiative/program
- product: product/tool/software/service. Publications only when they are the primary subject of analysis, not when cited as evidence sources
- event: event/conference/milestone/historical occurrence
- location: place/region/geographic concept
- other: observable, instantiable concrete things (a specific dataset, benchmark, physical instrument) that do not fit any category above. NOT for abstract ideas, paradigms, or techniques — those are concepts

**Classification Decision Tree (Entity vs. Concept) — apply in order, stop at first match:**
1. Named PERSON → entity (person)
2. Named ORGANIZATION, institution, company, team, lab → entity (organization)
3. Named PROJECT or named initiative → entity (project)
4. Named LOCATION, place, region → entity (location)
5. Named EVENT, conference, competition, release milestone → entity (event)
6. Named PRODUCT with its own vendor/release cycle (specific software package, hardware device, hosted service) → entity (product). Examples: PyTorch, GPT-4, BERT, TensorFlow. BUT if the source is not primarily ABOUT this product, extract its key ideas as concepts instead
7. Abstract THEORY, principle, hypothesis, cognitive/scientific model → concept (theory)
8. Procedural METHOD, algorithm, technique, protocol, training procedure → concept (method). Examples: gradient descent, RLHF, fine-tuning, chain-of-thought prompting, backpropagation
9. Broad TECHNOLOGY paradigm or architectural pattern → concept (technology). Examples: transformer architecture, deep learning, attention mechanism, retrieval-augmented generation
10. Any TERM, definition, or construct explaining how something works → concept (term)
11. A concrete named thing that does not fit rules 1–6 → entity (other). Reserve for observable/instantiable things only
12. If still uncertain → **prefer concept over entity**

**Key boundary**: Named AI models and named frameworks are entities (product). Architectural ideas and learning techniques are concepts (method/technology). When a source mentions a product only as a tool used for something else, extract its role/capabilities as a concept, not the product as an entity.

**Important Rules:**
- Output ONLY JSON, nothing else
- Entity and concept names should be English for generated Wiki pages unless the exact source phrase is a proper name, product name, acronym, or established technical term. Preserve original-language names as aliases when useful for search or attribution.
- "mentions_in_source" MUST contain 2-4 verbatim quotes from the source text. Do NOT paraphrase — copy the actual sentences where the entity/concept appears. Include full sentences with context, not fragments
- Only extracted wiki-worthy entities/concepts get independent pages; most source details should remain in the source summary.
- centrality=mention means the item MUST NOT become a standalone page. Keep it in the generated source page only.
- centrality=core is for the durable backbone of the source. centrality=supporting is for useful anchors, especially tools, historical analogies, and implementation choices that future queries may need.
- For short personal or daily notes, prefer one source page and at most one broad reusable pattern page. Do not extract timestamps, devices, lighting, noises, playlists, or mood words as standalone pages unless they recur or are explicitly important beyond this note.
- For abstract idea, methodology, architecture, or pattern notes, prioritize the semantic backbone: core idea, architecture, operations, constraints, source-of-truth model, synthesis, indexing, logging, and maintenance loop. Keep useful tools as supporting pages only when reusable; keep optional tooling, tips, examples, plugins, hotkeys, or implementation conveniences in the source summary unless the source is primarily about that tool.
- Carefully compare against existing content when detecting contradictions
- related_pages should be pages that actually exist in the current Wiki
- Output must be valid JSON format
- Do NOT repeat any item already in the "extracted list". If no unextracted items remain in the source, return empty arrays [] for entities and concepts
- Apply the wiki-link test to every candidate: if an entity/concept would not be linked from other notes, do not extract it. Knowledge claims and findings are more valuable than evidence containers`,

  // Semantic entity resolution: when slug-based matching fails, use LLM to determine
  // whether a newly extracted entity/concept is semantically equivalent to an existing page.
  resolveEntityDedup: `You are an entity resolution engine. Given a newly extracted entity/concept and a list of existing wiki pages, determine if it is semantically equivalent to any existing page.

**New entity/concept:**
- Name: {{entity_name}}
- Type: {{entity_type}}
- Summary: {{entity_summary}}

**Existing {{page_type}} pages:**
{{existing_pages}}

**Task:** Determine whether the new entity/concept is semantically the SAME as any existing page. Consider:
- Translations between languages (e.g. "清华大学" = "Tsinghua University")
- Abbreviations and full names (e.g. "MIT" = "Massachusetts Institute of Technology")
- Alternative phrasings (e.g. "Supervised Learning" = "Supervised ML")
- Spelling variations

**Output JSON:**
- If it matches an existing page, output: {"match": true, "path": "{{wikiFolder}}/entities/existing-slug.md"}
- If no match exists, output: {"match": false, "path": null}

Do NOT create a new name — only match against the existing pages listed above.`,
};
