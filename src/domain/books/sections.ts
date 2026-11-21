import type { Paragraph } from './paragraphs';

/**
 * Milestone 1 renders the book one *section* at a time (a run of whole
 * paragraphs of roughly SECTION_CHARS characters) so large books never enter
 * the DOM in full. Milestone 2 replaces this with the measured pagination engine.
 */
export interface Section {
  /** Index of first paragraph (inclusive). */
  from: number;
  /** Index of last paragraph (exclusive). */
  to: number;
  start: number;
  end: number;
}

export const SECTION_CHARS = 16000;

export function buildSections(paragraphs: readonly Paragraph[], target = SECTION_CHARS): Section[] {
  const sections: Section[] = [];
  let from = 0;
  let chars = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    chars += p.end - p.start;
    if (chars >= target) {
      sections.push({ from, to: i + 1, start: paragraphs[from]!.start, end: p.end });
      from = i + 1;
      chars = 0;
    }
  }
  if (from < paragraphs.length) {
    sections.push({ from, to: paragraphs.length, start: paragraphs[from]!.start, end: paragraphs[paragraphs.length - 1]!.end });
  }
  return sections;
}

export function sectionIndexForParagraph(sections: readonly Section[], paragraphIndex: number): number {
  let lo = 0;
  let hi = sections.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = sections[mid]!;
    if (paragraphIndex < s.from) hi = mid - 1;
    else if (paragraphIndex >= s.to) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(sections.length - 1, lo));
}
