// #137 — Gemini OpenAI-compat thinking dialect fallback
//
// Background: Gemini's OpenAI-compatible endpoint does NOT recognize
// Anthropic-style `thinking: { type: 'disabled' }`. It returns 400
// "Unknown name 'thinking'". The fix introduces a 3-tier dialect state
// machine on OpenAICompatibleClient:
//   'anthropic' → send thinking.type='disabled' (OpenAI, DeepSeek, xAI)
//   'openai'    → send reasoning_effort='none'       (Gemini OpenAI-compat)
//   'none'      → send no thinking-control field     (backends that reject both)
//
// Plus a generic 400-field-self-stripping layer for any field the backend
// rejects (temperature, repetition_penalty, chat_template_kwargs, ...).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { OpenAICompatibleClient } from '../../llm-client';

const mockRequestUrl = vi.mocked(requestUrl);

function makeOpenAIResponse(text: string, finishReason?: string) {
  return {
    status: 200,
    text: JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: finishReason ?? 'stop' }],
    }),
    json: {
      choices: [{ message: { content: text }, finish_reason: finishReason ?? 'stop' }],
    },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function makeGemini400Error(unknownFields: string[]): Error & { status: number; json: { error: { message: string } }; text: string } {
  // Match Gemini's exact error format so parseUnknownFields regex matches.
  const fieldMessages = unknownFields
    .map(f => `Invalid JSON payload received. Unknown name "${f}": Cannot find field.`)
    .join(' ');
  const errorBody = {
    error: {
      code: 400,
      message: fieldMessages,
      status: 'INVALID_ARGUMENT',
    },
  };
  const error = new Error(`Bad Request: ${fieldMessages}`) as Error & {
    status: number;
    json: { error: { message: string } };
    text: string;
  };
  error.status = 400;
  error.json = errorBody;
  error.text = JSON.stringify(errorBody);
  return error;
}

function makeGeminiTemperature400(): Error & { status: number; text: string; json: { error: { message: string } } } {
  const message = 'temperature must be in the range [0.0, 2.0] but was 2.5';
  const error = new Error(message) as Error & {
    status: number;
    text: string;
    json: { error: { message: string } };
  };
  error.status = 400;
  error.text = message;
  error.json = { error: { message } };
  return error;
}

// ── Test 1: dialect cache state machine ────────────────────────────

describe('OpenAICompatibleClient — #137 thinking dialect fallback', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(makeOpenAIResponse('ok'));
  });

  it('OpenAI baseUrl: first attempt with thinking succeeds, caches dialect=anthropic', async () => {
    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(client.thinkingControlDialect).toBe('anthropic');
  });

  it('Gemini baseUrl: 400 on thinking → fallback to reasoning_effort, caches dialect=openai', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockRejectedValueOnce(makeGemini400Error(['thinking']));
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('ok after fallback'));

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    const result = await client.createMessage({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(result).toBe('ok after fallback');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(firstBody.thinking).toEqual({ type: 'disabled' });
    expect(firstBody.reasoning_effort).toBeUndefined();

    const secondBody = JSON.parse((mockRequestUrl.mock.calls[1][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(secondBody.thinking).toBeUndefined();
    expect(secondBody.reasoning_effort).toBe('none');

    expect(client.thinkingControlDialect).toBe('openai');
  });

  it('Gemini baseUrl + cached dialect=openai: subsequent calls skip 400 probe, send reasoning_effort directly', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(makeOpenAIResponse('ok'));

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    // Pre-populate dialect cache to simulate result from previous testLLMConnection probe.
    client.thinkingControlDialect = 'openai';

    await client.createMessage({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);  // No 400 probe
    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(body.reasoning_effort).toBe('none');
    expect(body.thinking).toBeUndefined();
  });

  it('Backend rejects both thinking and reasoning_effort: fallback to none, sends no thinking field', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockRejectedValueOnce(makeGemini400Error(['thinking']));
    mockRequestUrl.mockRejectedValueOnce(makeGemini400Error(['reasoning_effort']));
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('ok after none'));

    const client = new OpenAICompatibleClient('test-key', 'https://strict-backend.example.com/v1');
    const result = await client.createMessage({
      model: 'strict-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(result).toBe('ok after none');
    expect(mockRequestUrl).toHaveBeenCalledTimes(3);

    const thirdBody = JSON.parse((mockRequestUrl.mock.calls[2][0] as { body: string }).body) as {
      thinking?: unknown;
      reasoning_effort?: unknown;
    };
    expect(thirdBody.thinking).toBeUndefined();
    expect(thirdBody.reasoning_effort).toBeUndefined();

    expect(client.thinkingControlDialect).toBe('none');
  });

  it('dialect=none: subsequent calls skip thinking-control field entirely (no extra round-trip)', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(makeOpenAIResponse('ok'));

    const client = new OpenAICompatibleClient('test-key', 'https://strict-backend.example.com/v1');
    client.thinkingControlDialect = 'none';

    await client.createMessage({
      model: 'strict-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: unknown;
      reasoning_effort?: unknown;
    };
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });
});

// ── Test 6: generic 400 field self-stripping ───────────────────────

describe('OpenAICompatibleClient — generic field stripping on 400', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('repetition_penalty rejected by backend → strips field and retries successfully', async () => {
    // Vitest mock queue: queued values are consumed in order. First call
    // should reject with 400 (so the strip-retry path engages), then
    // the strip-retry's call resolves with "ok".
    mockRequestUrl.mockRejectedValueOnce(makeGemini400Error(['repetition_penalty']));
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('ok'));

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    const result = await client.createMessage({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      repetition_penalty: 1.2,
    });

    expect(result).toBe('ok');

    // The strip-retry call should not contain repetition_penalty.
    const finalCall = mockRequestUrl.mock.calls[mockRequestUrl.mock.calls.length - 1];
    const finalBody = JSON.parse((finalCall[0] as { body: string }).body) as {
      repetition_penalty?: unknown;
    };
    expect(finalBody.repetition_penalty).toBeUndefined();

    // Field should be cached so future calls skip it.
    expect(client.unsupportedFields?.has('repetition_penalty')).toBe(true);
  });

  it('temperature out of range → strips field and retries (Gemini rejects temperature=2.5)', async () => {
    mockRequestUrl.mockRejectedValueOnce(makeGeminiTemperature400());
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('ok'));

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    const result = await client.createMessage({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 2.5,
    });

    expect(result).toBe('ok');

    // The temperature field is NOT in `parseUnknownFields`'s regex (it uses
    // "Unknown name \"X\"") — but the message still matches /Bad Request/,
    // so the retry-with-stripped-fields path engages and produces a successful
    // call without temperature.
    const finalCall = mockRequestUrl.mock.calls[mockRequestUrl.mock.calls.length - 1];
    const finalBody = JSON.parse((finalCall[0] as { body: string }).body) as {
      temperature?: unknown;
    };
    expect(finalBody.temperature).toBeUndefined();
  });

  it('Cached unsupported field is pre-stripped on next request (no probe round-trip)', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(makeOpenAIResponse('ok'));

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    // Simulate prior probe result
    client.unsupportedFields = new Set(['repetition_penalty']);

    await client.createMessage({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      repetition_penalty: 1.2,
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);  // No 400 probe
    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      repetition_penalty?: unknown;
    };
    expect(body.repetition_penalty).toBeUndefined();
  });
});

// ── Test 9: Stream path symmetry ───────────────────────────────────

describe('OpenAICompatibleClient.createMessageStream — #137 thinking dialect', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('OpenAI baseUrl: stream sends thinking.type=disabled when dialect=anthropic', async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      text: 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      json: {} as never,
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Awaited<ReturnType<typeof requestUrl>>);

    const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
    await client.createMessageStream({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
      enableThinking: false,
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('Gemini baseUrl + dialect=openai: stream sends reasoning_effort=none, skips 400 probe', async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      text: 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      json: {} as never,
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Awaited<ReturnType<typeof requestUrl>>);

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    client.thinkingControlDialect = 'openai';

    await client.createMessageStream({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
      enableThinking: false,
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: unknown;
      reasoning_effort?: string;
    };
    expect(body.reasoning_effort).toBe('none');
    expect(body.thinking).toBeUndefined();
  });

  it('Stream 400 on thinking → fallback to reasoning_effort and retry', async () => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockRejectedValueOnce(makeGemini400Error(['thinking']));
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      text: 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      json: {} as never,
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Awaited<ReturnType<typeof requestUrl>>);

    const client = new OpenAICompatibleClient('test-key', 'https://generativelanguage.googleapis.com/v1beta/openai');
    await client.createMessageStream({
      model: 'gemini-2.5-flash',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
      enableThinking: false,
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((mockRequestUrl.mock.calls[1][0] as { body: string }).body) as {
      thinking?: unknown;
      reasoning_effort?: string;
    };
    expect(secondBody.reasoning_effort).toBe('none');
    expect(secondBody.thinking).toBeUndefined();
  });
});

// ── Test 8: AnthropicClient / AnthropicCompatibleClient regression guard ──

describe('AnthropicClient / AnthropicCompatibleClient — #137 regression guard', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('AnthropicClient: still uses thinking.type=disabled (no dialect switch)', async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
      json: { content: [{ type: 'text', text: 'ok' }] },
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Awaited<ReturnType<typeof requestUrl>>);

    const { AnthropicClient } = await import('../../llm-client');
    const client = new AnthropicClient('test-key');
    await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('AnthropicCompatibleClient: still uses thinking.type=disabled (no dialect switch)', async () => {
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
      json: { content: [{ type: 'text', text: 'ok' }] },
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Awaited<ReturnType<typeof requestUrl>>);

    const { AnthropicCompatibleClient } = await import('../../llm-client');
    const client = new AnthropicCompatibleClient('test-key', 'https://api.anthropic.com/v1');
    await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as {
      thinking?: { type: string };
      reasoning_effort?: string;
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.reasoning_effort).toBeUndefined();
  });
});