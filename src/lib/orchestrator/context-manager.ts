import type { ContextSection } from './types';

export interface CompressedContext {
  content: string;
  truncated: boolean;
  originalLength: number;
}

export interface ContextCompressionOptions {
  maxCharacters?: number;
}

const DEFAULT_MAX_CHARACTERS = 12_000;

function serializeSections(sections: ContextSection[]): string {
  return sections
    .map((section) => `${section.title}\n${section.content}`.trim())
    .join('\n\n');
}

export function compressContext(
  sections: ContextSection[],
  options: ContextCompressionOptions = {}
): CompressedContext {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const serialized = serializeSections(sections);

  if (serialized.length <= maxCharacters) {
    return {
      content: serialized,
      truncated: false,
      originalLength: serialized.length,
    };
  }

  const safeSections = sections.length === 0 ? [{ title: 'Context', content: serialized }] : sections;
  const headerBudget = Math.max(200, Math.floor(maxCharacters / safeSections.length));
  const compressed = safeSections
    .map((section) => {
      const header = `${section.title}\n`;
      const contentBudget = Math.max(0, headerBudget - header.length - 32);
      const truncatedContent =
        section.content.length > contentBudget
          ? `${section.content.slice(0, contentBudget).trimEnd()}\n...[truncated]`
          : section.content;

      return `${header}${truncatedContent}`.trim();
    })
    .join('\n\n')
    .slice(0, maxCharacters)
    .trimEnd();

  return {
    content: compressed,
    truncated: true,
    originalLength: serialized.length,
  };
}
