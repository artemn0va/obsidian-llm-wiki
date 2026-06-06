# LLM Wiki Plugin Project Development Standards

**Last Updated:** 2026-06-07

---

## Current Phase: v1.16.2 — Released (P0 bug fix batch)

### Completed (v1.16.2) — Released 2026-06-07
- ✅ **Issue #94: Lint cancellation**: AbortSignal propagated through 5 fix-runner functions. `try/finally` wraps all persistent Notices.
- ✅ **Issue #96: Lint granularity**: `appendGranularityToPrompt` injects extractionGranularity into lint LLM analysis. 4 tests.
- ✅ **Issue #99 + #86: Thinking token bleeding**: Three-layer defense — API `disableThinking` + `parseJsonResponse` strip + `cleanMarkdownResponse` Layer B2 preamble detection.
- ✅ **ROADMAP P3 #11**: `parseJsonResponse` strips `<think>`/`<thinking>` before brace-counting.
- ✅ **ROADMAP P3 #12**: `disableThinking` interface on `LLMClient` with `thinking.type='disabled'`, Test Connection probe + cache, 400 fallback.
- ✅ **Issue #103: Delete empty stubs**: Lint modal button + 8-language i18n + try/finally.
- ✅ **Tests**: 549/549 (+37 new tests). 4-Gate: lint 0/0, tsc 0, test 549, build clean.

### Completed (v1.16.0)
- ✅ **Issue #81: Sources normalization**: 4 pure functions in `src/core/sources-normalizer.ts`, 22 tests, Lint integration (section 0.5), startup quick fixes. 6 pollution patterns → canonical `[[sources/X]]`. 572 files/1616 entries cleaned on reporter's ~3800-page vault.
- ✅ **Issue #75: LM Studio 8K + token cap**: Removed `source-analyzer.ts:113` shadow constant. New Context Window setting (dropdown 4K~1M) caps max_tokens + truncation retry. LMStudio provider added. `capMaxTokens` pure function.
- ✅ **Issue #76: TOKENS_DEDUP_RESOLUTION 300→1000**: Token budget safety margin. Deleted dead constants `TOKENS_PAGE_MERGE`, `TOKENS_RELATED_UPDATE`.
- ✅ **Alias language fix (replaces PR #82)**: English as linker language, "no invented technical translations" guard. Explicit examples (Transformer≠变换器).
- ✅ **Startup quick fixes**: Default ON. Auto-repair sources + verify wiki structure. Single 10s aggregated Notice.
- ✅ **Settings UX redesign**: LLM-Wiki Status section, LLM Configuration/Wiki Configuration rename, Provider dropdown i18n.

### Deferred to P3 (high mock complexity — current ROI insufficient)
- ⏸ wiki-engine `ingestSource` full-path tests (P2 #4 → P3 #14): requires Obsidian App + 5 submodule mocks
- ⏸ query-engine core flow tests (P2 #5 → P3 #15): requires Modal + MarkdownRenderer + DOM mocks
- ⏸ True streaming for 3rd-party providers: `requestUrl` returns full response, not stream — would need Obsidian native streaming support

### Earlier Releases

Complete version history (v1.14.0 → v1.0.0) is maintained in [ROADMAP.md](ROADMAP.md). CLAUDE.md tracks only the current phase and active work items.

### P0 — Not applicable (v1.16.2 released)

All P0 items resolved. Current phase transitions to cleanup & technical debt.

### P1 — Cleanup (v1.17.0 target)

| Item | Effort |
|------|--------|
| page-factory resolvePagePath LLM fallback + merge + append tests | 1 day |
| runLintWiki phase extraction (762 → 6 × ~130 lines) | half day |
| Fix thinkingControlCache key mismatch when baseUrl is empty | 1h |
| Fix deleteEmptyStubs callback error handling | 1h |
| Update thinkingControlSupported after successful 400 fallback | 1h |
| Broaden isThinkingControlError detection patterns | 30min |
| Skip unnecessary thinking probe for Anthropic clients | 30min |

### P2 — Test infrastructure (deferred, high mock complexity)

| Item | Effort | Reason |
|------|--------|--------|
| wiki-engine ingestSource full-path integration tests | 2-3 days | Requires Obsidian App + 5 submodule mocks |
| query-engine core flow tests (Layer 1/2/3) | 1-2 days | Requires Modal + MarkdownRenderer + DOM mocks |

### P3 — Backlog

| Item | Effort |
|------|--------|
| Good First Issue tagging | 10min |
| Tag vocabulary ecosystem (Issues #85/#90/#91) | 2-3 days |
| Restore true streaming for 3rd-party providers | 1-2 days |

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
└── __tests__/                      # Unit tests (vitest, 121 tests)
```

---

## 🛡️ Three-No Principle

Every change must satisfy all three before being considered complete.
**Automated gates catch syntax/type/test errors; manual review catches logic
and architectural errors that no linter can see.**

### 1. No Side Effects — required structured review

**Goal**: The change does not alter behavior outside its intended scope.

#### 1a. Call-site Audit
Run `grep -rn "<functionName>" src/` to list every call-site. For each:
- [ ] **Arguments**: check if any caller depends on old return value / side effect
- [ ] **Return value**: check if any caller would break with new return shape
- [ ] **Error handling**: check if try/catch or `.catch()` paths still make sense

#### 1b. Data Flow Trace
For each modified function, trace:
- [ ] **Inputs**: Where does each parameter value originate? (user input / setting / file / LLM / computed)
- [ ] **Outputs**: Where does each return value / mutated state go? (file write / UI / downstream function / cache)
- [ ] **Side effects**: Does the function mutate external state? (file system, Obsidian API, global vars, DOM)
- [ ] **IO points**: Mark every `await this.ctx.*`, `app.*`, `document.*`, `localStorage.*`

#### 1c. State Mutation Analysis
- [ ] If the function is async: can it run concurrently with itself or another function touching the same state?
- [ ] If the function writes files: does it overwrite or append? Is the path deterministic?
- [ ] If the function reads settings: does it handle missing/new fields gracefully?

#### 1d. Error Propagation Check
- [ ] New error paths: are they caught by all callers?
- [ ] Changed error types: do existing catch blocks still match?
- [ ] Silent failures: are there any paths that swallow errors without logging?

**Deliverable**: A 3-5 sentence side-effect assessment, e.g.:
> "Modified `resolvePagePath` is called from 2 private methods in PageFactory.
> The new `collision` return field is consumed by `createOrUpdatePage` and
> `IngestReportModal` only. No other module touches this path. The function
> still writes aliases via `appendAliases` (same side effect as before); no
> new IO introduced."

### 2. No Breaking Changes — required structured review

**Goal**: Existing users do not need to reconfigure or migrate data.

| Dimension | Check | Method | Pass Criteria |
|-----------|-------|--------|---------------|
| **API Signature** | Function params / return type changed? | `git diff` + `grep` | All call-sites updated; no new required params without defaults |
| **Settings Schema** | `data.json` fields added/removed? | Check `types.ts` + `settings.ts` | New fields have defaults in constructor; removed fields are gracefully ignored |
| **File Format** | Frontmatter / output / index format changed? | Check generation templates | Old files load without error; new format is backward-compatible |
| **Default Behavior** | Any default value changed? | Check constructor / config init | Old behavior is preserved unless explicitly opted in |
| **Command/Setting IDs** | Any command palette ID or setting key renamed? | `grep` for IDs/keys | IDs unchanged; if changed, old IDs still map |
| **Obsidian API** | Minimum Obsidian version requirement changed? | `manifest.json` | `minAppVersion` >= current; no new Obsidian-exclusive APIs |

**Deliverable**: A breaking-change verdict: "None detected" or a specific migration plan.

### 3. No Test Errors or Warnings — **Four automated gates (2026-06-01 upgrade)**

```bash
# Gate 1: ESLint (code style + logic rules)
pnpm lint
# Required: 0 errors, 0 warnings
# Checks: no-unused-vars, no-floating-promises, Obsidian rules, etc.

# Gate 2: TypeScript (type safety)
npx tsc --noEmit
# Required: 0 errors, 0 warnings
# Checks: type matching, interface completeness, null/undefined handling
# Critical: ESLint passing does NOT guarantee type safety, must verify separately

# Gate 3: Tests (functional validation)
pnpm test
# Required: all pass, 0 failures

# Gate 4: Build (production compilation)
pnpm build
# Required: clean exit
```

**Critical note (Phase 4 lesson):**
- **ESLint and TypeScript are complementary tools, must BOTH pass**
- ESLint does NOT check type matching (e.g., missing required interface fields)
- TypeScript does NOT check code style (e.g., no-floating-promises)
- **Single tool passing is insufficient, requires dual verification**

If any gate fails: fix the root cause, do NOT add `@ts-ignore` or `eslint-disable`
to silence it. Re-run all four gates after each fix.

### ⚠️ Anti-patterns that bypass these checks

- "The tests pass, so it's fine" → Tests only cover what you thought to test
- "It's just a one-line change" → One-line changes are the most dangerous
- "I'll add tests later" → Tests must accompany the change, not follow it
- "The PR review will catch it" → The reviewer has less context than you
- "ESLint passes, TypeScript errors are fine" → ESLint does NOT check type safety

## ⚠️ Git Safety Protocol

- **NEVER commit or push without explicit user permission.** Non-negotiable.

## 📦 Development Workflow

1. `pnpm lint && pnpm test && npx tsc --noEmit && pnpm build` — all four must pass (Three-No Principle)

### Build modes

- `pnpm build` — **production** build (console.debug disabled, no sourcemap). Use for release.
- `pnpm build:dev` — **debug** build (inline sourcemap + console.debug preserved). Use when the user requests a local test build.
- `pnpm dev` — **watch** mode (rebuilds on file change, same as build:dev but stays running).

When the user says "build local debug file for testing" or asks for manual testing files:
1. Run `pnpm build:dev` to generate `main.js` (2MB+ with inline sourcemap)
2. Verify `main.js` ends with `//# sourceMappingURL=data:application/json;base64,...`
3. Confirm `console.debug` is NOT replaced (header should not contain `console.debug = function(){};`)
4. The 3 output files are: `main.js`, `manifest.json`, `styles.css`
5. Offer to zip them or tell the user the paths
2. Update relevant docs and memory
3. Present change summary for user review
4. Commit locally after user approval (do NOT push directly to main)
5. When ready to push: create a feature branch, push the branch, create a PR, **merge via `gh pr merge`** (or GitHub UI)
6. After PR merge: pull main, create tag (NO `v` prefix), push tag
7. Wait for GitHub Actions to create Draft Release
8. Generate release notes (via `/obsidian-plugin-release` skill)
9. **Main branch is protected** — direct pushes are rejected with `GH013`

```bash
# Push workflow (main is protected)
git checkout -b chore/vX.Y.Z-release
git push origin chore/vX.Y.Z-release
gh pr create --title "chore: bump version to X.Y.Z" --body "## Summary\n...\n\n## Test plan\n- [x] ..." --base main
gh pr merge <PR#> --merge --delete-branch
git checkout main && git pull origin main

# Tag (after PR merge, NO 'v' prefix)
git tag -a X.Y.Z -m "X.Y.Z"
git push origin X.Y.Z
```

## Tag & Release workflow

**Use `/obsidian-plugin-release` skill for complete release preparation.**

Tags are pushed AFTER the PR is merged to main:
```bash
# Ensure you're on the latest main with the merged commit
git checkout main && git pull origin main
git tag -a X.Y.Z -m "X.Y.Z"
git push origin X.Y.Z
# GitHub Actions creates the draft release automatically
```

**Before version bump commit**, verify ALL items in skill's Pre-Release Checklist:
- All 8 READMEs' "What's New" section REPLACED (not appended)
- TOC links match actual heading text exactly
- CHANGELOG.md entry added
- Lockfiles regenerated (pnpm + npm official registry)

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

### Auto-close issues via commit message

When a commit resolves tracked Issues, append `Closes #N` (or `Fixes #N` / `Resolves #N`) at the end of the commit body. This triggers GitHub to auto-close the issue when the commit hits the default branch.

```bash
git commit -m "fix: batch P0 fixes

- #94: propagate AbortSignal to fix-runners
- #96: inject extractionGranularity into lint

Closes #94, #96, #99"
```

**NEVER** use `gh issue close` or the GitHub UI to close issues manually — let the commit message do it. This keeps the git history → issue link intact and avoids premature closure before the code reaches default branch.

## 🧪 Development Quality Closure (TDD + Planning)

**Mandatory development loop for every code change** (new feature, bug fix, refactor). This is a quality closure — skipping any step is a violation.

```
1. Deep thinking    → What is the problem? Edge cases? Failure modes?
2. Plan             → Files to change, function signatures, side effects
3. Write test       → Failing test that defines expected behavior
4. Confirm RED      → Run test, verify it fails for the right reason
5. Implement        → Minimum code to make the test pass
6. Confirm GREEN    → Run test, verify it passes
7. Refactor         → Clean up; tests must still pass
8. 4-Gate verify    → lint + tsc + test + build all clean
9. Three-No review  → No side effects, no breaking changes, no warnings
```

**When tests are required** (mandatory):
- New exported function, class, or module
- New behavior branch (any new if/else path)
- **Bug fix** — the test reproduces the bug; the fix makes the test pass
- Refactor that changes observable behavior

**When tests are optional**:
- Pure configuration, type-only changes, documentation

**Pre-existing code**: when modifying a function with zero tests, add at least one test for the changed path first.

**Why this is a closure, not a checklist**: Each step depends on the previous. Skipping "design test" leads to misaligned implementation. Skipping "confirm RED" means you don't know if the test actually catches the bug. Skipping "refactor" accumulates technical debt. Skipping "4-Gate" lets broken code reach PR.

**Real example (2026-06-02)**: When extracting `parseSSEEvents`, the initial implementation was written first (TDD violation). User caught it. Corrected flow: 11 failing tests → confirmed all fail with `parseSSEEvents is not a function` → wrote minimal implementation → tests pass → fixed unused import warning + `isolatedModules` type export → 4-Gate green.

**🔴 Real example — TDD shell failure (2026-06-02, Issue #81)**: Wrote 4 `fixPollutedSources` tests, all using inline format `sources: ["..."]`. Production code took the **multi-line** path `sources:\n  - "..."`. A regex-only diff returned `fixed=2` but content didn't actually change. User discovered at runtime: "every Notice shows the same number, no real cleanup". This is the **shell test** failure mode — tests pass but don't verify behavior.

**Mandatory test rules (effective 2026-06-02)**:
1. **Cover ALL production code paths.** If a function branches on input format (inline vs multi-line, JSON vs YAML, etc.), write tests for EACH format. Inspect the production code to find all branches.
2. **Assert content mutation, not just return values.** After calling a mutating function, assert `output !== input` AND `output` contains the expected new content. Asserting `expect(fixed).toBe(N)` is necessary but not sufficient.
3. **Re-scan assertion for idempotency tests.** After one fix, re-invoke the detector on the output. If the detector still reports "polluted", the fix didn't actually work — the test must FAIL, not silently pass.
4. **Inspect actual output during debugging.** When a test passes suspiciously (e.g. "idempotent" passes on first run with no change), run a debug script that prints the function's actual output. Don't trust GREEN without seeing it.

**Test quality principle (root, 2026-06-02)**: A test that passes but does not faithfully simulate real-world behavior, does not cover corner cases, or is written merely to "make it pass" is a **shell test** — it provides false confidence and is worse than no test at all. **High-quality tests are the prerequisite for high-quality code.** If you cannot write a test that would catch a real bug in this function, the test is not yet ready. Write the test that would have caught the production bug — not the test that makes your implementation look right.

**Debug template** for "stuck counter" / "no real change" symptoms:
```ts
// src/__tests__/_tmp/debug.test.ts (delete after debugging)
import { fixX } from '../../core/x';
it('debug', () => {
  const r = fixX(input);
  console.log('OUTPUT:', r);
});
```

**Reference**: [[feedback-tdd-standard]] for full TDD standard with examples.

## ✅ Pre-Commit Checklist

**四重Gate验证（2026-06-01升级）**：

```bash
pnpm lint           # Gate 1: ESLint - 0 errors, 0 warnings
npx tsc --noEmit    # Gate 2: TypeScript - 0 errors, 0 warnings
pnpm test           # Gate 3: Tests - all pass, 0 failures
pnpm build          # Gate 4: Build - clean exit
```

**重要**：四个命令必须**全部通过**才能提交。单一工具通过不足够（Phase 4教训）。

---

## ⚠️ Development Protocol: Plan First, Then Execute

**Before starting any significant change** (refactoring, new modules, prompt modification, architectural decisions, or anything touching core engine files):

1. **Present your plan** — explain what, why, and how
2. **Wait for explicit user approval** before writing code or committing
3. **For multi-phase work**: pause and report after each phase

**Exceptions** (no prior approval needed): trivial one-line fixes, running lint/test/build, reading files, documenting existing code.

**Why**: The user is the domain expert on product vision. The AI has tooling capability but lacks product context. Propose, don't dispose.

## 🧪 TDD: Write Tests First

For any new function or behavior change: write a failing test first, then write the implementation, then refactor. When modifying untested core code, add at least one test for the path you're changing. See TDD Standard above.

---

**Maintainer:** Greener-Dalii | **Repository:** green-dalii/obsidian-llm-wiki
