/**
 * Paragraph model. A paragraph is a [start, end) range into the normalized
 * book text with leading/trailing whitespace (incl. full-width U+3000 indent)
 * trimmed away. Blank lines produce no paragraph.
 *
 * Very long lines (some TXT files have no line breaks at all) are split into
 * pieces at sentence punctuation so no single DOM node becomes enormous.
 * Pieces after the first are marked `continuation` so they render without indent.
 */

export interface Paragraph {
  start: number;
  end: number;
  continuation: boolean;
}

export const MAX_PARAGRAPH_CHARS = 1500;

const WS = /[\s　 ﻿]/;
// Break after sentence-ending punctuation, optionally followed by closing quotes/brackets.
const SENTENCE_END = /[。！？!?…；;.]["'”’」』）)\]】]*/g;

function isWs(ch: string | undefined): boolean {
  return ch !== undefined && WS.test(ch);
}

export function splitParagraphs(text: string, maxChars = MAX_PARAGRAPH_CHARS): Paragraph[] {
  const out: Paragraph[] = [];
  let lineStart = 0;
  const len = text.length;
  while (lineStart <= len) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = len;
    let s = lineStart;
    let e = lineEnd;
    while (s < e && isWs(text[s])) s++;
    while (e > s && isWs(text[e - 1])) e--;
    if (e > s) pushSplit(text, s, e, maxChars, out);
    lineStart = lineEnd + 1;
  }
  return out;
}

function pushSplit(text: string, start: number, end: number, maxChars: number, out: Paragraph[]) {
  let s = start;
  let first = true;
  while (end - s > maxChars) {
    const windowText = text.slice(s, s + maxChars);
    let cut = -1;
    SENTENCE_END.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENTENCE_END.exec(windowText))) {
      const pos = m.index + m[0].length;
      if (pos >= maxChars * 0.5 && pos < windowText.length) cut = pos;
    }
    if (cut === -1) cut = maxChars; // no punctuation — hard cut
    // Don't split a UTF-16 surrogate pair.
    const code = text.charCodeAt(s + cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--;
    out.push({ start: s, end: s + cut, continuation: !first });
    first = false;
    s += cut;
    while (s < end && isWs(text[s])) s++;
  }
  if (end > s) out.push({ start: s, end, continuation: !first });
}

/** Index of the paragraph containing `offset` (or the nearest one before it). */
export function paragraphIndexAt(paragraphs: readonly Paragraph[], offset: number): number {
  let lo = 0;
  let hi = paragraphs.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (paragraphs[mid]!.start <= offset) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
