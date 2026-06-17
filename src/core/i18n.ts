import { TEXTS } from '../texts';

// Type-safe i18n accessor. Falls back to EN_TEXTS when key is missing in target language.
export function getText<K extends keyof typeof TEXTS.en>(
  language: string,
  key: K,
  replacements?: Record<string, string>
): string {
  const texts = TEXTS[language as keyof typeof TEXTS] || TEXTS.en;
  let text = texts[key] as unknown as string;
  if (!text) {
    text = TEXTS.en[key] as unknown as string;
  }
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}
