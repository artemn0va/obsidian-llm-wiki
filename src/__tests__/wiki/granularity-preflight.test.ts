import { describe, expect, it } from 'vitest';
import type { LLMClient, LLMWikiSettings } from '../../types';
import {
  parsePreflightDecision,
  resolveGranularityPreflight,
} from '../../wiki/granularity-preflight';
import { DEFAULT_SETTINGS } from '../__support__/engine-context';

const autoSettings: LLMWikiSettings = {
  ...DEFAULT_SETTINGS,
  extractionGranularity: 'auto',
};

describe('granularity preflight', () => {
  it('parses coarse decisions', async () => {
    const result = await parsePreflightDecision(JSON.stringify({
      granularity: 'coarse',
      source_kind: 'abstract methodology note',
      reason: 'A clean semantic backbone is enough.',
    }));

    expect(result.resolved).toBe('coarse');
    expect(result.source_kind).toBe('abstract methodology note');
    expect(result.warning).toBeUndefined();
  });

  it('parses standard decisions', async () => {
    const result = await parsePreflightDecision(JSON.stringify({
      granularity: 'standard',
      source_kind: 'technical playbook',
      reason: 'Multiple reusable workflows and tools are present.',
    }));

    expect(result.resolved).toBe('standard');
  });

  it('parses fine decisions', async () => {
    const result = await parsePreflightDecision(JSON.stringify({
      granularity: 'fine',
      source_kind: 'dense research notes',
      reason: 'Most sections contain page-worthy durable knowledge.',
    }));

    expect(result.resolved).toBe('fine');
  });

  it('parses custom decisions with clamped limits', async () => {
    const result = await parsePreflightDecision(JSON.stringify({
      granularity: 'custom',
      source_kind: 'bounded pilot ingest',
      reason: 'A precise extraction cap is better than a preset.',
      customEntityLimit: 12.6,
      customConceptLimit: 999,
    }));

    expect(result.resolved).toBe('custom');
    expect(result.customEntityLimit).toBe(13);
    expect(result.customConceptLimit).toBe(500);
  });

  it('falls back to standard on invalid JSON', async () => {
    const result = await parsePreflightDecision('not json');

    expect(result.resolved).toBe('standard');
    expect(result.warning).toContain('invalid JSON');
  });

  it('falls back to standard on missing granularity', async () => {
    const result = await parsePreflightDecision(JSON.stringify({
      source_kind: 'unknown',
      reason: 'Missing mode.',
    }));

    expect(result.resolved).toBe('standard');
    expect(result.warning).toContain('invalid granularity');
  });

  it('skips the LLM call for manual granularity modes', async () => {
    let calls = 0;
    const client: LLMClient = {
      createMessage: async () => {
        calls += 1;
        throw new Error('should not be called');
      },
    };

    const result = await resolveGranularityPreflight({
      settings: { ...autoSettings, extractionGranularity: 'coarse' },
      client,
      sourcePath: 'sources/example.md',
      basename: 'example',
      content: '# Example',
    });

    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it('uses LLM preflight for auto mode', async () => {
    let calls = 0;
    const client: LLMClient = {
      createMessage: async () => {
        calls += 1;
        return JSON.stringify({
          granularity: 'standard',
          source_kind: 'technical note',
          reason: 'Reusable tools and workflows are present.',
        });
      },
    };

    const result = await resolveGranularityPreflight({
      settings: autoSettings,
      client,
      sourcePath: 'sources/example.md',
      basename: 'example',
      content: '# Example\n\nUse qmd and Marp.',
    });

    expect(result?.resolved).toBe('standard');
    expect(calls).toBe(1);
  });
});
