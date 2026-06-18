// v1.20.0: Default behavior — no custom thinking/temperature/repetition_penalty
// is sent unless the user explicitly enables Custom Advanced Settings.
//
// Background: v1.18.3+ defaulted to disableThinking=true, which forced
// `thinking.type='disabled'` (or chat_template_kwargs) into every request.
// Many providers (OpenAI official, LMStudio, Ollama, Anthropic old models)
// reject these fields with HTTP 400. v1.20.0 inverts the default so the
// plugin never injects provider-specific control fields unless the user
// explicitly opts in via Custom Advanced Settings.
//
// Per user's design: when the user EXPLICITLY enables "Disable thinking" in
// Custom mode, the existing 3-tier dialect fallback chain handles
// tier-by-tier degradation (anthropic → openai → none → gracefully no-op).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { OpenAICompatibleClient, AnthropicClient, AnthropicCompatibleClient } from '../../llm-client';

const mockRequestUrl = vi.mocked(requestUrl);

function make200Response(): Awaited<ReturnType<typeof requestUrl>> {
  return {
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

describe('v1.20.0: default behavior — no custom thinking/temperature/penalty', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue(make200Response());
  });

  describe('OpenAICompatibleClient.createMessage', () => {
    it('does not send thinking field when caller does not pass enableThinking', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).not.toHaveProperty('thinking');
      expect(sentBody).not.toHaveProperty('reasoning_effort');
      expect(sentBody).not.toHaveProperty('chat_template_kwargs');
    });

    it('does not send temperature when caller does not pass temperature', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).not.toHaveProperty('temperature');
    });

    it('does not send repetition_penalty when caller does not pass repetition_penalty', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).not.toHaveProperty('repetition_penalty');
    });

    it('still respects explicitly passed temperature (custom advanced mode)', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        temperature: 0.5,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody.temperature).toBe(0.5);
    });

    it('uses max_completion_tokens for gpt-5-* models', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-5-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).toHaveProperty('max_completion_tokens', 100);
      expect(sentBody).not.toHaveProperty('max_tokens');
    });

    it('uses max_tokens for gpt-4-* models (existing behavior)', async () => {
      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).toHaveProperty('max_tokens', 100);
      expect(sentBody).not.toHaveProperty('max_completion_tokens');
    });
  });

  describe('AnthropicClient.createMessage', () => {
    it('does not send thinking field when caller does not pass enableThinking', async () => {
      // Override default response to Anthropic format
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: '',
        json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicClient('test-key');
      await client.createMessage({
        model: 'claude-opus-4-8',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).not.toHaveProperty('thinking');
    });

    it('normalizes default baseUrl to include /v1 suffix', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: '',
        json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicClient('test-key');
      await client.createMessage({
        model: 'claude-opus-4-8',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const url = (mockRequestUrl.mock.calls[0][0] as { url: string }).url;
      expect(url).toBe('https://api.anthropic.com/v1/messages');
    });

    it('does not double-append /v1 if user already provides it', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: '',
        json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicClient('test-key', 'https://api.anthropic.com/v1');
      await client.createMessage({
        model: 'claude-opus-4-8',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const url = (mockRequestUrl.mock.calls[0][0] as { url: string }).url;
      expect(url).toBe('https://api.anthropic.com/v1/messages');
    });

    it('appends /v1 to custom proxy baseUrl', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: '',
        json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicClient('test-key', 'https://my-proxy.example.com');
      await client.createMessage({
        model: 'claude-opus-4-8',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const url = (mockRequestUrl.mock.calls[0][0] as { url: string }).url;
      expect(url).toBe('https://my-proxy.example.com/v1/messages');
    });
  });

  describe('AnthropicCompatibleClient.createMessage', () => {
    it('does not send thinking field when caller does not pass enableThinking', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: '',
        json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicCompatibleClient('test-key', 'https://my-proxy.example.com');
      await client.createMessage({
        model: 'claude-opus-4-8',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const sentBody = JSON.parse((mockRequestUrl.mock.calls[0][0] as { body: string }).body) as Record<string, unknown>;
      expect(sentBody).not.toHaveProperty('thinking');
    });
  });

  describe('OpenAICompatibleClient truncation retry — gpt-5 max_completion_tokens', () => {
    it('preserves max_completion_tokens key in truncation retry for gpt-5', async () => {
      // Call 1: truncated response (finish_reason=length)
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }], usage: { completion_tokens: 100 } }),
        json: { choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }], usage: { completion_tokens: 100 } },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);
      // Call 2: retry success
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: 'full response' }, finish_reason: 'stop' }] }),
        json: { choices: [{ message: { content: 'full response' }, finish_reason: 'stop' }] },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      const result = await client.createMessage({
        model: 'gpt-5-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('full response');
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);

      // Verify retry body uses max_completion_tokens, not max_tokens
      const retryBody = JSON.parse((mockRequestUrl.mock.calls[1][0] as { body: string }).body) as Record<string, unknown>;
      expect(retryBody).toHaveProperty('max_completion_tokens', 200);
      expect(retryBody).not.toHaveProperty('max_tokens');
    });

    it('uses max_tokens key in truncation retry for gpt-4 models', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }], usage: { completion_tokens: 100 } }),
        json: { choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }], usage: { completion_tokens: 100 } },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: 'full response' }, finish_reason: 'stop' }] }),
        json: { choices: [{ message: { content: 'full response' }, finish_reason: 'stop' }] },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new OpenAICompatibleClient('test-key', 'https://api.openai.com/v1');
      const result = await client.createMessage({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toBe('full response');
      const retryBody = JSON.parse((mockRequestUrl.mock.calls[1][0] as { body: string }).body) as Record<string, unknown>;
      expect(retryBody).toHaveProperty('max_tokens', 200);
      expect(retryBody).not.toHaveProperty('max_completion_tokens');
    });
  });

  describe('AnthropicClient.listModels — uses this.baseUrl', () => {
    it('uses configured baseUrl instead of hardcoded api.anthropic.com', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: JSON.stringify({ data: [{ id: 'claude-opus-4-8' }, { id: 'claude-sonnet-4-6' }] }),
        json: { data: [{ id: 'claude-opus-4-8' }, { id: 'claude-sonnet-4-6' }] },
        headers: {},
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Awaited<ReturnType<typeof requestUrl>>);

      const client = new AnthropicClient('test-key', 'https://my-proxy.example.com');
      const models = await client.listModels();

      expect(models).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6']);
      const url = (mockRequestUrl.mock.calls[0][0] as { url: string }).url;
      expect(url).toBe('https://my-proxy.example.com/v1/models');
    });
  });
});
