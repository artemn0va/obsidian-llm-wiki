import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { OpenAICompatibleClient } from '../../llm-client';
import { wrapWithAdvancedSettings } from '../../llm-client-wrapper';

const mockRequestUrl = vi.mocked(requestUrl);

function makeOpenAIResponse(text: string, finishReason: string = 'stop') {
  const payload = {
    choices: [{ message: { content: text }, finish_reason: finishReason }],
  };
  return {
    status: 200,
    text: JSON.stringify(payload),
    json: payload,
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function makeClient() {
  return new OpenAICompatibleClient('key', 'https://api.openai.com/v1');
}

describe('wrapWithAdvancedSettings — advanced settings injection (Issue #99 / #128)', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(makeOpenAIResponse('ok'));
  });

  it('does not inject any advanced params when all settings are empty (default)', async () => {
    const client = makeClient();
    wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
    });

    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
    expect(body.temperature).toBeUndefined();
    expect(body.repetition_penalty).toBeUndefined();
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it('injects extractionTemperature as temperature when set', async () => {
    const client = makeClient();
    wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
      extractionTemperature: 0.15,
    });

    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as { temperature?: number };
    expect(body.temperature).toBe(0.15);
  });

  it('does not override caller-provided temperature', async () => {
    const client = makeClient();
    wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
      extractionTemperature: 0.15,
    });

    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as { temperature?: number };
    expect(body.temperature).toBe(0.7);
  });

  it('injects repetition_penalty when set', async () => {
    const client = makeClient();
    wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
      repetitionPenalty: 1.1,
    });

    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as { repetition_penalty?: number };
    expect(body.repetition_penalty).toBe(1.1);
  });

  it('injects chat_template_kwargs when enableThinking is false', async () => {
    const client = makeClient();
    // The wrapper injects chat_template_kwargs for callers that pass
    // enableThinking=false (the wrapper also passes it). Since the wrapper
    // always passes enableThinking=false when disableThinking=true, the
    // kwarg injection is the final safety net.
    // We test the wrapper directly to ensure the ternary is correct.
    const wrapped = wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
      enableThinking: false,
    });

    await wrapped.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as { chat_template_kwargs?: { enable_thinking?: boolean } };
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('does NOT inject chat_template_kwargs when enableThinking is not passed (default)', async () => {
    const client = makeClient();
    wrapWithAdvancedSettings(client, {
      maxTokensPerCall: 0,
    });

    await client.createMessage({
      model: 'gpt-4o',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as { chat_template_kwargs?: unknown };
    expect(body.chat_template_kwargs).toBeUndefined();
  });
});
