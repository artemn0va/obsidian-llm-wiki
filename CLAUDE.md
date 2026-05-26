# LLM Wiki Plugin Project Development Standards

**Last Updated:** 2026-05-26

---

## Current Phase: v1.10.3 — Robustness & UX Improvements

### Completed (v1.10.3)
- ✅ **Issue #41 — 529 "Overloaded" not retried**: Error messages now embed HTTP status codes across all client classes. All retry regex patterns include `overload` keyword. Affected `AnthropicCompatibleClient`, `AnthropicClient`, `OpenAICompatibleClient`.
- ✅ **Issue #37 — Double-nested wiki-links in log.md**: Three-layer defense: (1) prompt forces plain names for `related_pages`, (2) source-analyzer strips `[[...]]` syntax as post-processing, (3) `updateRelatedPage` returns `boolean` — pages not actually found are no longer reported as "updated."
- ✅ **Issue #43 — Cancel ingestion mid-run**: `AbortController` with checkpoints at each batch boundary. Status bar item (clickable) + command palette (`Cancel current ingestion`). Folder ingestion loop breaks on cancellation. Immediate Notice feedback on cancel request.
- ✅ **Issue #40 — Opposite-directory stub creation**: Stub safety nets (LLM path + deterministic fallback) now check slug-equivalence via `slugify()`, preventing duplicate stubs when pages exist under different formatting in the opposite directory.
- ✅ **Issue #34 — Extraction prompt rewrite**: Graph-centric ("wiki-link test") replaces document-centric criteria. Bibliographic references explicitly excluded. Entity Recognition Guide updated for person/product types.
- ✅ **PageFactory refactoring** (ROADMAP P1): 8 entity/concept methods unified into 4 generic methods. Code reduced 563→424 lines (-25%). Public API unchanged.
- ✅ **Lint double-nested link auto-fix**: Lint now programmatically detects and fixes `[[[[...]]]]` patterns across all wiki directory files. +5 unit tests.
- ✅ **Lint cancel support**: `runLintWiki` accepts `AbortSignal`, checks at batch boundaries (page reads, LLM dedup, LLM analysis). Shared status bar and command with ingest cancel.
- ✅ **Cancellation UX feedback**: CancelIngestion immediately shows Notice toast + updates progress indicator.

### Completed (v1.10.2)
- ✅ **Custom granularity per-type limits fix**: Three inconsistencies fixed — `source-analyzer.ts` enforces per-type caps, `getGranularityInstruction()` injects concrete numbers, `getGranularityFixLimits()` reads user settings. +6 unit tests.

### Completed (v1.10.1)
- ✅ **Issue #32 — Slug normalization in resolvePagePath**: Fast path 2 checks title + aliases via normalized slug comparison. +4 unit tests.

### Completed (v1.10.0)
- ✅ **Issue #30/#31 — Aliases + Granularity expansion**: Minimal/Custom options, UX improvements, i18n across 8 languages.

### P1 — Short-term
- LLM client retry extraction (shared `withRetry`)
- `createMessageStream` language type consistency
- `parseJsonResponse` + `mergeFrontmatter` unit tests

### P2 — Medium-term
- `slugify` debug log reduction (8→2)
- Residual Chinese comment cleanup
- Ingest current file (no file picker) + ribbon icon (Issue #44)
- Anthropic prompt caching via `cache_control: ephemeral` (Issue #38)
- `mentions_in_source` filtering in merge prompts (Issue #39)

### Already Evaluated (not doing)
- `getExistingWikiPages` cache bypass → Solve when it hurts
- `runLintWiki` 760-line method → Flat > Nested
- Custom YAML parser → Correct choice for Obsidian plugin constraints

---

## 📁 Project Structure

```
src/
├── main.ts                         # Plugin entry point
├── types.ts                        # Shared types + EngineContext
├── utils.ts                        # Utilities (slugify, parseJson, etc.)
├── texts.ts                        # i18n texts (barrel, 8 languages)
├── llm-client.ts                   # LLM clients
├── wiki/                           # Wiki engine
│   ├── wiki-engine.ts              # Orchestrator
│   ├── query-engine.ts             # Conversational query
│   ├── source-analyzer.ts          # Iterative batch extraction
│   ├── page-factory.ts             # Entity/concept CRUD + merge
│   ├── conversation-ingest.ts      # Chat → wiki knowledge
│   ├── lint-fixes.ts               # Fix logic
│   ├── lint-controller.ts          # Lint orchestration
│   ├── lint/                       # Lint sub-modules
│   ├── contradictions.ts           # Contradiction detection
│   ├── system-prompts.ts           # Language directive + labels
│   └── prompts/                    # LLM prompt templates
├── schema/                         # Schema co-evolution
├── ui/
│   ├── settings.ts                 # Settings panel
│   └── modals.ts                   # Lint/Ingest/Query modals
└── __tests__/                      # Unit tests (vitest, 106 tests)
```

---

## ⚠️ Git Safety Protocol

- **NEVER commit or push without explicit user permission.** Non-negotiable.

## 📦 Development Workflow

1. `pnpm lint && pnpm test && pnpm build` pass
2. Update relevant docs and memory
3. Present change summary for user review
4. Commit only after user approval
5. Push only after user approval

---

## 📋 Karpathy Philosophy Compliance

- **Knowledge compounds** — query results flow back into wiki
- **Human-in-the-loop** — LLM suggests, user decides
- **Three-layer architecture** — Sources → Wiki → Schema
- **Incremental accumulation** — wiki is persistent, not one-shot

## 🎯 Python Zen Design Principles

- **Simple > Complex** — comment not framework
- **Flat > Nested** — linear code beats micro-methods
- **Solve when it hurts** — don't optimize before measuring
- **Explicit > Implicit** — function types ARE documentation

## 🔑 Key Design Decisions

- **Tier 1/2 duplicate detection**: Tier 1 always verified (high-precision), Tier 2 fills token budget
- **`Promise.allSettled` error isolation**: One failure doesn't crash the batch
- **Pollution defense at write gate**: Centralized regex catches ALL sources
- **LLM semantic page selection**: Meaning-based matching, not keyword

---

## 🌍 Internationalization

- **UI**: 8 languages, 269+ fields
- **Wiki output**: 8 languages + custom input
- **Code**: English only, minimal comments

## 📋 Git Commit Standards

English, conventional commits. `feat:` `fix:` `docs:` `refactor:` `test:` `chore:`

## ✅ Pre-Commit Checklist

- `pnpm lint` (0 errors), `pnpm test` (all pass), `pnpm build` (clean), `npx tsc --noEmit` (0 errors)

- `pnpm lint` (0 errors), `pnpm test` (all pass), `pnpm build` (clean), `tsc --noEmit` (0 errors)

---

**Maintainer:** Greener-Dalii | **Repository:** green-dalii/obsidian-llm-wiki
