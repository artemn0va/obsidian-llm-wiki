// Thin wrapper that injects advanced settings into createMessage calls.
// v1.20.0: by default the plugin does NOT inject any provider-specific
// thinking-control / temperature / repetition_penalty field. Each setting
// is only sent when the caller explicitly passed it AND when the user has
// configured a value in Custom Advanced Settings. This keeps backward
// compatibility: empty/undefined settings mean "use provider default".
//
// Issue #99: disableThinking (data.json field) was a v1.18.2 opt-out that
// was flipped to opt-in in v1.20.0 — see types.ts for the new semantics.
// When the user does enable it, the LLMClient itself walks the 3-tier
// dialect fallback (anthropic → openai → none). The wrapper stays passive.
// Issue #128: extractionTemperature / chatTemperature inject `temperature`.
// Issue #128 follow-up: repetitionPenalty injects `repetition_penalty`.
// Issue #75: maxTokensPerCall cap wraps max_tokens via capMaxTokens.

import { LLMClient } from './types';
import { capMaxTokens } from './core/token-cap';

export interface WrapperSettings {
  maxTokensPerCall: number;
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
    });
  };

  return client;
}
