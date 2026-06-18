// v1.20.0: When user explicitly enables "Disable thinking" in Custom mode,
// the 3-tier dialect fallback chain activates:
//   Tier 1: thinking.type='disabled'  → if 200, done
//   Tier 2: reasoning_effort='none'    → if 200, done
//   Tier 3: no field                   → done (graceful no-op + user notice)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { OpenAICompatibleClient } from '../../llm-client';

const mockRequestUrl = vi.mocked(requestUrl);

function make200Response() {
  return {
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function make400Error(message: string): Error & { status: number; json: { error: { message: string } }; text: string } {
  const errorBody = { error: { code: 400, message, status: 'INVALID_ARGUMENT' } };
  const error = new Error(`Bad Request: ${message}`) as Error & {
    status: number;
    json: { error: { message: string } };
    text: string;
  };
  error.status = 400;
  error.json = errorBody;
  error.text = JSON.stringify(errorBody);
  return error;
}

describe('v1.20.0: explicit disableThinking → 3-tier dialect fallback', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('Tier 1: sends thinking.type=disabled on first attempt', async () => {
    mockRequestUrl.mockResolvedValue(make200Response());
    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
    await client.createMessage({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
    expect(sentBody.thinking).toEqual({ type: 'disabled' });
  });

  it('Tier 2: falls back to reasoning_effort=none when thinking is rejected with 400', async () => {
    // First call: 400 with "Unknown name 'thinking'"
    // Second call: 200 OK
    mockRequestUrl
      .mockRejectedValueOnce(make400Error("Unknown name 'thinking': Cannot find field."))
      .mockResolvedValueOnce(make200Response());

    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
    await client.createMessage({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(mockRequestUrl.mock.calls.length).toBe(2);

    // First attempt: thinking field
    const firstBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
    expect(firstBody.thinking).toEqual({ type: 'disabled' });

    // Second attempt: reasoning_effort instead
    const secondBody = JSON.parse((mockRequestUrl.mock.calls[1][0] as { body: string }).body) as Record<string, unknown>;
    expect(secondBody.reasoning_effort).toBe('none');
    expect(secondBody).not.toHaveProperty('thinking');
  });

  it('Tier 3: falls back to no thinking field when both prior tiers rejected', async () => {
    // All three calls fail; final succeeds with no thinking field
    mockRequestUrl
      .mockRejectedValueOnce(make400Error("Unknown name 'thinking': Cannot find field."))
      .mockRejectedValueOnce(make400Error("Unknown name 'reasoning_effort': Cannot find field."))
      .mockResolvedValueOnce(make200Response());

    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
    await client.createMessage({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(mockRequestUrl.mock.calls.length).toBe(3);

    // Final attempt: neither thinking nor reasoning_effort
    const finalBody = JSON.parse((mockRequestUrl.mock.calls[2][0] as { body: string }).body) as Record<string, unknown>;
    expect(finalBody).not.toHaveProperty('thinking');
    expect(finalBody).not.toHaveProperty('reasoning_effort');
  });

  it('does not invoke fallback when enableThinking is undefined (default mode)', async () => {
    mockRequestUrl.mockResolvedValue(make200Response());
    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');

    // Single 200 on first try
    await client.createMessage({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(mockRequestUrl.mock.calls.length).toBe(1);
    const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('thinking');
    expect(sentBody).not.toHaveProperty('reasoning_effort');
  });
});
