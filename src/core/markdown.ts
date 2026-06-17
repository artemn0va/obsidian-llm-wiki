export function cleanMarkdownResponse(response: string): string {
  console.debug('cleanMarkdownResponse input length:', response.length);

  let cleaned = response.trim();

  cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');

  if (cleaned.indexOf('\n---\n') === -1) {
    const headerMatch = cleaned.match(/\n#{1,2} \S/);
    if (headerMatch) {
      const cutIdx = cleaned.indexOf(headerMatch[0]);
      if (cutIdx > 0) {
        cleaned = cleaned.slice(cutIdx + 1).replace(/^\s+/, '');
      }
    }
  }

  const codeBlockPatterns = [
    /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/gm,
    /^```(?:markdown|md)?\s*([\s\S]*?)```$/gm,
    /^```(?:markdown|md)?\s*\n([\s\S]*)$/gm,
    /^```(?:markdown|md)?\s*([\s\S]*)$/gm,
  ];

  for (const pattern of codeBlockPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = cleaned.replace(pattern, '$1').trim();
      console.debug('code block wrapping detected, removed');
      break;
    }
  }

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/, '');
    console.debug('removed opening code block marker');
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```$/, '');
    console.debug('removed closing code block marker');
  }

  console.debug('cleanMarkdownResponse output length:', cleaned.length);
  console.debug('first 50 chars:', cleaned.substring(0, 50));

  if (!cleaned.startsWith('---')) {
    const fmEnd = cleaned.indexOf('\n---\n');
    if (fmEnd !== -1) {
      const beforeFm = cleaned.substring(0, fmEnd);
      const looksLikeFrontmatter =
        beforeFm.includes(':') &&
        !beforeFm.startsWith('#') &&
        !beforeFm.startsWith('```') &&
        beforeFm.split('\n').filter(l => l.trim()).every(l => l.includes(':') || l.trim() === '');
      if (looksLikeFrontmatter) {
        cleaned = '---\n' + cleaned;
        console.debug('added missing opening ---');
      } else {
        cleaned = cleaned.substring(fmEnd + 1);
        console.debug('removed preamble text before frontmatter');
      }
    }
  }

  return cleaned.trim();
}
