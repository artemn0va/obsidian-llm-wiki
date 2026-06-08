# LLM Wiki Plugin Roadmap

> Feature planning and improvement proposals

**Version:** 1.17.0 | **Updated:** 2026-06-08

---

## Current Status

### Implemented (v1.17.0) — Long-Document Ingestion & Source Attribution

Major quality release addressing previously-unprocessable large sources and a class of metadata-integrity issues that caused silent data corruption. **Closes #90.** Headline wins:

- **Long-document ingestion now works.** A 619KB Chinese source (史记 / Shiji) that previously failed after 3 minutes and 15 items now completes fully, extracting hundreds of entities and concepts. Root causes addressed: (a) custom granularity was hardcoded to 15 items max regardless of caps, (b) `max_tokens` was capped below the response length needed for large batches, (c) truncation retries couldn't grow beyond 16K. Fix: dynamic `initialBatchSize` (capped at 50), `maxBatchesBase` derived from caps, `max_tokens` scales 16K→20K→60K with auto halve-and-retry on truncation.
- **Mentions carry source attribution (footnote-style).** The "Mentions in Source" section now renders each verbatim quote as `- "quote" — [[source-path|display-name]]`, replacing the previous free-form block of untraced quotes. Future page merges can never mix up which quote came from which source.
- **Source pages inherit tags from the source note frontmatter (Issue #90).** The LLM used to inject arbitrary concept names (e.g. `Alzheimer-Demenz`, `Neuroprotektion`) into source pages, polluting the user's tag vocabulary. New `extractSourceTags()` pure helper reads the source note's frontmatter and passes tags directly to the summary-page template, falling back to LLM-derived names only when the source has no tags.
- **Provider settings now sync everywhere.** Switching Provider/API Key/Model in Settings used to fail to reach the wiki engine; the next Ingest/Lint/Query would silently use the old provider. Fixed via `WikiEngine.updateSettings()` that keeps the EngineContext in sync with the live settings object (root cause: `settings.ts` was replacing `plugin.settings` with a NEW object from `tempSettings` spread, but EngineContext captured the OLD reference at construction time).
- **Dates are now programmatic, not LLM-generated.** `enforceFrontmatterConstraints` strips LLM-invented `created`/`updated` dates and replaces them: `created` preserved on merge, `updated` always set to today.
- **Lint reports persisted to log.md** with minute-precision timestamps so multiple same-day Lint runs are distinguishable. The Lint Report Modal shows a `📋 Full report saved to log.md` hint.
- **Custom granularity upper bound raised from 300 to 500** to support professional knowledge bases (legal, medical, deep research).
- **Default Schema documents the new contracts.** Three new sections in the default `wiki-folder/schema/config.md`: Source Page Template (mandates tag inheritance), Date Fields (programmatic, not LLM-generated), Mentions Format (academic-footnote style).
- **Test connection restores live settings on failure.** A failed Test Connection no longer persists broken config; previous settings are restored.
- **38 new tests added (549 → 587)**; 28 test files, 0 regressions.

---

## Next Milestone: v1.18.0 — Cleanup & Test Infrastructure

Focused on closing technical debt and adding integration tests for previously untested core paths.

### P1 — Cleanup

| Item | Effort |
|------|--------|
| page-factory resolvePagePath LLM fallback + merge + append tests | 1 day |
| runLintWiki phase extraction (762 → 6 × ~130 lines) | half day |
| Refine error message classification (`context`/`exceed`/`401`/`429`) based on user feedback | 1h |
| Add capability-based provider cache (per-baseUrl observed max prompt size) | 1-2 days |

### P2 — Test Infrastructure (deferred, high mock complexity)

| Item | Effort | Reason |
|------|--------|--------|
| wiki-engine ingestSource full-path integration tests | 2-3 days | Requires Obsidian App + 5 submodule mocks |
| query-engine core flow tests (Layer 1/2/3) | 1-2 days | Requires Modal + MarkdownRenderer + DOM mocks |

### P3 — Backlog

- Good First Issue tagging
- Tag vocabulary ecosystem (Issues #85/#91) — design discussion pending
- Restore true streaming for 3rd-party providers (requires Obsidian native streaming support)

### Evaluated & Rejected

| Proposal | Source | Reason |
|----------|--------|--------|
| Hexagonal Architecture refactoring | Audit 1 | Over-engineering for Obsidian plugin; mock alone enables testing |
| Vector search (Ollama embeddings) | Audit 1 | Requires Ollama + embedding model; <1% of users have this |
| Hash-bucket dedup optimization | Audit 1 | No user-reported perf issue; solve when it hurts |
| page-factory try/catch completion | Audit 2 | Exceptions bubble to wiki-engine's centralized error handler by design |
| API URL validation | Audit 1 | Obsidian's requestUrl already validates; self-phishing impossible |

### P3 — Nice-to-have

- #36 — Source title in frontmatter: needs clarification from issue author

---

## Version Timeline

| Version | Date | Headline |
|---------|------|----------|
| **1.17.0** | 2026-06-08 | Long-document ingestion + source attribution (Closes #90) |
| 1.16.3 | 2026-06-07 | v1.16.2 P0 hotfix completion |
| 1.16.2 | 2026-06-07 | Lint cancel + thinking token bleeding + delete empty stubs |
| 1.16.0 | 2026-06-04 | Sources normalization + Context Window + LMStudio |
| 1.15.0 | 2026-06-01 | PR #87/#88 + aliases unification |
| 1.13.0 | 2026-05-26 | ConflictResolver + 6 audited improvements |
| 1.12.0 | 2026-05-20 | Extraction rearchitected, ~80% faster |
| 1.10.0 | 2026-05-15 | Aliases + granularity expansion |
| 1.9.0 | 2026-05-10 | Pollution defense + 14-issue batch |
| 1.8.1 | 2026-05-05 | Rate limit + smart fix all + 53 tests |
| 1.0.0 | initial | First Obsidian release |

### Earlier Versions (v1.16.2 and prior)

Full version history (v1.16.2 → v1.0.0) is preserved in [CHANGELOG.md](CHANGELOG.md). ROADMAP tracks only the current release and active work.

#### Highlights (chronological)

- **v1.16.2 — P0 Bug Fix Batch**: Lint cancel AbortSignal propagation, thinking-token bleeding three-layer defense, delete-empty-stubs.
- **v1.16.0 — Sources Normalization + Client Refinement**: Issue #81 (sources normalizer, 22 tests), Context Window setting, LMStudio provider, startup quick fixes.
- **v1.15.0 — Stability & UX Hotfix**: PR #87/#88 merged, aliases unification.
- **v1.13.0 — Quality & Infrastructure**: ConflictResolver, mock infrastructure, 6 audited improvements.
- **v1.12.0 — Production-Grade Performance**: extraction rearchitected, ~80% faster.
- **v1.10.0 — Aliases + Granularity Expansion**: 4 user-facing improvements.
- **v1.9.0 — Pollution Defense & Quality Upgrade**: 14-issue batch.
- **v1.8.1 — UX Hardening**: rate limit notice, smart fix all, settings reorg.
- **v1.7.20 — Code Quality Phase 1**: 5 deep fixes + modular splits.
- **v1.7.0 and earlier** — see CHANGELOG.md for full history.
