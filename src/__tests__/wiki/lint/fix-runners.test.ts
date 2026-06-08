import { describe, it, expect, vi } from 'vitest';
import { Notice } from 'obsidian';
import { runAliasCompletion, runDeadLinkFixes, runEmptyPageFixes, runOrphanFixes, runDuplicateMerges } from '../../../wiki/lint/fix-runners';
import type { LintContext } from '../../../wiki/lint-controller';

// NoticeMock in setup.ts adds a static `instances` array. Cast the imported
// Notice to access the mock-side field for test introspection.
const NoticeMock = Notice as unknown as {
  instances: Array<{ message: string; hidden: boolean }>;
};

// Minimal LintContext mock — only the fields used by the cancellation check.
// Returns LintContext via a single final cast to avoid sprinkling `as any` everywhere.
const makeCtx = (overrides: Partial<LintContext> = {}): LintContext => {
  const base: Partial<LintContext> = {
    app: { vault: { adapter: { write: vi.fn().mockResolvedValue(undefined) } } } as unknown as LintContext['app'],
    settings: {
      wikiFolder: 'wiki',
      language: 'en',
      pageGenerationConcurrency: 1,
      batchDelayMs: 0,
      model: 'test-model',
    } as unknown as LintContext['settings'],
    llmClient: { createMessage: vi.fn() } as unknown as LintContext['llmClient'], // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    wikiEngine: {
      fixDeadLink: vi.fn().mockResolvedValue('ok'),
      fillEmptyPage: vi.fn().mockResolvedValue('expanded'),
      linkOrphanPage: vi.fn().mockResolvedValue(['wiki/OtherPage']),
      mergeDuplicatePages: vi.fn().mockResolvedValue('merged'),
    } as unknown as LintContext['wikiEngine'],
    onAnalyzeSchema: vi.fn(),
  };
  return { ...base, ...overrides } as unknown as LintContext;
};

// ── Cancellation propagation (Issue #94) ──────────────────────────
// Status bar "click to cancel" already exists, but the fix-runner
// functions in this module never received the AbortSignal. Each
// runner must check `signal.aborted` at entry AND inside its loop.

describe('fix-runners — AbortSignal propagation', () => {
  const expectAbort = (promise: Promise<unknown>) =>
    expect(promise).rejects.toMatchObject({ name: 'AbortError' });

  it('runAliasCompletion aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    await expectAbort(
      runAliasCompletion(ctx, controller.signal, [
        { path: 'wiki/a.md', content: '---\n---\nbody', basename: 'a' },
      ])
    );
  });

  it('runDeadLinkFixes aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    await expectAbort(
      runDeadLinkFixes(ctx, controller.signal, [{ source: 'a', target: 'missing' }])
    );
  });

  it('runEmptyPageFixes aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    await expectAbort(
      runEmptyPageFixes(ctx, controller.signal, [{ path: 'wiki/a.md', content: '' }])
    );
  });

  it('runOrphanFixes aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    await expectAbort(
      runOrphanFixes(ctx, controller.signal, ['wiki/a.md'])
    );
  });

  it('runDuplicateMerges aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    await expectAbort(
      runDuplicateMerges(ctx, controller.signal, [{ target: 'a', source: 'b', reason: 'dup' }])
    );
  });

  it('runDeadLinkFixes stops mid-loop when signal aborts', async () => {
    const ctx = makeCtx();
    const controller = new AbortController();
    let callCount = 0;
    const wikiEngine = ctx.wikiEngine as unknown as {
      fixDeadLink: (sourcePath: string, target: string) => Promise<string>;
    };
    wikiEngine.fixDeadLink = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) controller.abort();
      return 'ok';
    });
    const links = Array.from({ length: 10 }, (_, i) => ({ source: `s${i}`, target: `t${i}` }));
    await expectAbort(runDeadLinkFixes(ctx, controller.signal, links));
    // Should have stopped after first call (which triggered abort)
    expect(callCount).toBeLessThan(10);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('fix-runners work normally when no signal provided (backward compat)', async () => {
    const ctx = makeCtx();
    const result = await runDeadLinkFixes(ctx, undefined, [
      { source: 'a', target: 'missing' },
    ]);
    expect(result.fixed).toBeGreaterThanOrEqual(0);
  });

  // Simplify Phase 1.3: fixNotice.hide() must run even on AbortError,
  // otherwise a permanent Notice('', 0) is left on the status bar.
  it('runDeadLinkFixes hides the fixNotice when signal aborts mid-loop', async () => {
    const ctx = makeCtx();
    const controller = new AbortController();
    NoticeMock.instances.length = 0;
    let callCount = 0;
    const wikiEngine = ctx.wikiEngine as unknown as {
      fixDeadLink: (sourcePath: string, target: string) => Promise<string>;
    };
    wikiEngine.fixDeadLink = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) controller.abort();
      return 'ok';
    });
    const links = Array.from({ length: 10 }, (_, i) => ({ source: `s${i}`, target: `t${i}` }));
    await expectAbort(runDeadLinkFixes(ctx, controller.signal, links));
    // The most recently created Notice should have been hidden
    const lastNotice = NoticeMock.instances[NoticeMock.instances.length - 1];
    expect(lastNotice?.hidden).toBe(true);
  });

  it('runEmptyPageFixes does not create a fixNotice when signal aborts at entry', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx();
    NoticeMock.instances.length = 0;
    await expectAbort(
      runEmptyPageFixes(ctx, controller.signal, [{ path: 'wiki/a.md', content: '' }])
    );
    // Entry-aborted means no work — no fixNotice should have been created
    // (avoids a stuck persistent Notice on the status bar).
    expect(NoticeMock.instances).toHaveLength(0);
  });
});
