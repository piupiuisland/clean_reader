import type { Paragraph } from './paragraphs';

export interface Chapter {
  title: string;
  /** Offset of the heading in the normalized text. */
  offset: number;
}

const NUM = '[0-9０-９零〇一二两三四五六七八九十百千万]+';
const CHAPTER_PATTERNS: RegExp[] = [
  // 第一章 / 第12回 / 第三卷 ...
  new RegExp(`^第\\s*${NUM}\\s*[章节回卷集部篇幕话]`),
  // 序章 / 楔子 / 尾声 / 番外一 ...
  /^(序章|序言|序|楔子|引子|引言|前言|尾声|后记|终章|完结感言|番外|附录)(?=$|[\s：:·　一二三四五六七八九十0-9])/,
  // Chapter 1 / CHAPTER XII / Prologue / Epilogue
  /^(chapter|part|book)\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b/i,
  /^(prologue|epilogue)\b/i,
];

/** Headings are short lines; longer lines that merely start with "第一章" are prose. */
export const MAX_HEADING_CHARS = 40;

export function isChapterHeading(line: string): boolean {
  if (line.length > MAX_HEADING_CHARS) return false;
  return CHAPTER_PATTERNS.some((re) => re.test(line));
}

export function detectChapters(text: string, paragraphs: readonly Paragraph[]): Chapter[] {
  const out: Chapter[] = [];
  for (const p of paragraphs) {
    if (p.continuation || p.end - p.start > MAX_HEADING_CHARS) continue;
    const line = text.slice(p.start, p.end);
    if (isChapterHeading(line)) out.push({ title: line.replace(/[\s　]+/g, ' '), offset: p.start });
  }
  return out;
}

/** Index of the chapter containing `offset`, or -1 if before the first chapter. */
export function chapterIndexAt(chapters: readonly Chapter[], offset: number): number {
  let lo = 0;
  let hi = chapters.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chapters[mid]!.offset <= offset) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
