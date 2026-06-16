// Thin wrapper that injects advanced settings into createMessage calls.
// Default behavior: pass-through unchanged (zero behavior change).
// Each setting is injected only when the caller did not already pass the
// parameter explicitly and when the user has configured a value.
//
// Issue #99: disableThinking (data.json field, default true) sends a
// thinking-control directive. If the first directive (`thinking.type=
// 'disabled'`) is rejected, the client auto-falls back to the
// chat-template kwarg — the wrapper only passes the boolean toggle.
// Issue #128: extractionTemperature / chatTemperature inject `temperature`.
// Issue #128 follow-up: repetitionPenalty injects `repetition_penalty`.
// Issue #75: maxTokensPerCall cap wraps max_tokens via capMaxTokens.

import { LLMClient } from './types';
import { capMaxTokens } from './core/token-cap';

export interface WrapperSettings {
  maxTokensPerCall: number;
  enableThinking?: boolean;
  extractionTemperature?: number;
  chatTemperature?: number;
  repetitionPenalty?: number;
}

/**
 * Returns a new LLMClient whose `createMessage` injects advanced settings
 * when set; otherwise passes through. The returned client's `createMessage`
 * never modifies a caller-provided parameter — only fills in unset ones.
 */
export function wrapWithAdvancedSettings(
  client: LLMClient,
  settings: WrapperSettings
): LLMClient {
  const capTokens = settings.maxTokensPerCall > 0;
  const originalCreate = client.createMessage.bind(client) as (params: Parameters<typeof client.createMessage>[0]) => ReturnType<typeof client.createMessage>;

  // Replace createMessage in-place; calling code keeps the same client reference.
  (client as unknown as { createMessage: LLMClient['createMessage'] }).createMessage = async (params) => {
    return originalCreate({
      ...params,
      ...(capTokens ? { max_tokens: capMaxTokens(params.max_tokens, { maxTokensPerCall: settings.maxTokensPerCall }), maxTokensPerCall: settings.maxTokensPerCall } : {}),
      ...(params.temperature === undefined && settings.extractionTemperature !== undefined ? { temperature: settings.extractionTemperature } : {}),
      ...(params.repetition_penalty === undefined && settings.repetitionPenalty !== undefined ? { repetition_penalty: settings.repetitionPenalty } : {}),
      ...(params.chat_template_kwargs === undefined && settings.enableThinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    });
  };

  return client;
}
