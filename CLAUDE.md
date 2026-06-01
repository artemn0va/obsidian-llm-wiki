# LLM Wiki Plugin Project Development Standards

**Last Updated:** 2026-06-01

---

## Current Phase: v1.13.0 — Quality & Infrastructure

### Completed (v1.13.0)
- ✅ **Cross-type duplicate prevention (#54)**: `resolvePagePath()` checks opposite folder (entities ↔ concepts) when same-type matching fails. Cross-type collisions merge content into existing page instead of silently losing information. Contributed by @dmarchevsky.
- ✅ **Source analysis false abort fix (#61)**: First batch gate changed from `||` to `&&`. Only aborts when BOTH entities and concepts are absent. Contributed by @Indexed-Apogrypha (Matthew Harper).
- ✅ **NormalizeBatchResponse pure function**: Centralized ~8 scattered `|| []` fallbacks into `BatchValidity`-typed normalization. Fixes hidden TypeError for non-array truthy LLM output.
- ✅ **Aliases seeding**: `EntityInfo`/`ConceptInfo.aliases?` — extraction pre-generates alias seeds for page generation and multi-round dedup.
- ✅ **Multi-round extraction context**: Injects already-extracted names+aliases into later round prompts, eliminating LLM internal-state dependency.
- ✅ **Prompt task 0 rewritten**: Separated field round restrictions from content requirements.
- ✅ **Alias self-pointing dedup**: `filterRedundantAliases` skips aliases equal to the page's own filename.
- ✅ **Think token stripping (Issue #64)**: `cleanMarkdownResponse` strips `<think>`/`<thinking>` blocks. Enables reasoning model support (DeepSeek-R1, QwQ, etc).
- ✅ **LM Studio compatibility (Issue #65)**: `response_format: json_object` removed from OpenAI-compatible client.
- ✅ **Sources link constraint (Issue #63)**: `UNIVERSAL_LINK_CONSTRAINTS` injected into 3 previously-unprotected prompts.
- ✅ **ConflictResolver pure layer**: `src/core/conflict-resolver.ts` — zero-side-effect conflict detection, 7 unit tests.
- ✅ **Mock infrastructure**: `createMockContext` for core engine testing without Obsidian runtime.
- ✅ **firstBatchData type narrowing**: `Partial<SourceAnalysis>` → `NormalizedBatch`.
- ✅ **Constants centralization**: 16 token budget constants, 8 notice constants, retry params, `MAX_PAGE_CONTENT_CHARS`, `WIKI_SUBFOLDERS` activated.
- ✅ **loadRelevantPages content truncation**: Capped at `MAX_PAGE_CONTENT_CHARS` (~3000 tokens).
- ✅ **Three-No Principle structured**: Actionable evaluation procedures (call-site audit, data flow trace, breaking-change matrix).
- ✅ **CI uses npm for build**: Matches Obsidian verification exactly — Build verification passes.
- ✅ **198 tests** across 6 test files (+25 since v1.12.4).

### Completed (v1.12.0)
- ✅ **Extraction prompt rearchitected**: Full page list removed from prompt. Extraction speed is now independent of wiki size. ~80% faster for typical files.
- ✅ **Dynamic batch limits + convergence detection**: Short content finishes in 1–2 batches. Long content gets enough batches. Low-yield batches terminate early.
- ✅ **Short-content auto-downgrade**: Sources <20K chars cap maxTotalItems proportionally, preventing "hard digging".
- ✅ **Deterministic related_pages matching**: `matchExtractedToExisting()` uses slug + alias matching — zero LLM cost, more reliable.
- ✅ **esbuild upgraded**: 0.17.3 → 0.28.0 (dev-server vulnerability fixed).
- ✅ **Production build suppresses console.debug**: `console.debug = function() {}` banner.
- ✅ **Granularity ≤ notation**: 8 languages synchronized with consistent numbers.
- ✅ **Extraction and lint progress improvements**: batch counts and cumulative results displayed.
- ✅ **What's New section in all READMEs**: Localized in 8 languages with proper TOC anchors.
- ✅ **Test coverage**: 140 tests across 3 test files (+27 since v1.11.0).
- ✅ **ROADMAP P2/P3 items addressed**: build:dev script, esbuild upgrade, Good First Issue tagging.

### P0 — In Progress

| Item | Source | Effort |
|------|--------|--------|
| Wiki-engine core tests: ingestSource full path (mock 6+ LLM calls) | 三份独立审核共识 | 1 day |
| `query-engine.ts` core tests | 审核共识 | 1 day |

### P1 — Planned

| Item | Source | Effort |
|------|--------|--------|
| page-factory.ts full path: resolvePagePath LLM fallback + merge + append | ROADMAP | 1 day |
| `runLintWiki` phase extraction (762→6×~130行) | ROADMAP | 半天 |

### P2 — Backlog

| Item | Effort |
|------|--------|
| Good First Issue tagging | 10min |
| WIKI_SUBFOLDERS full migration (lint-fixes.ts frontmatter writes) | 10min |

### Completed (v1.12.0)

### Evaluated & Rejected (v1.12.0)

| Proposal | Source | Reason |
|----------|--------|--------|
| Hexagonal Architecture refactoring | 审计一 | Over-engineering for Obsidian plugin; mock alone enables testing |
| Vector search (Ollama embeddings) | 审计一 | Requires Ollama + embedding model; <1% of users have this |
| Hash-bucket dedup optimization | 审计一 | No user-reported perf issue; solve when it hurts |
| page-factory try/catch 补全 | 审计二 | Exceptions bubble to wiki-engine's centralized error handler by design |
| API URL validation | 审计一 | Obsidian's requestUrl already validates; self-phishing impossible |

