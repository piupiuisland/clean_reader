export interface SearchHit {
  offset: number;
  before: string;
  match: string;
  after: string;
}

export const MAX_SEARCH_HITS = 500;
const CONTEXT = 16;

/** Lower-cases ASCII only, so offsets in the folded text match the original exactly. */
export function foldAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function oneLine(s: string): string {
  return s.replace(/[\s　]+/g, ' ');
}

/**
 * Plain-text search. `folded` is `foldAscii(text)`. Pass it in so the caller can
 * cache it across keystrokes.
 */
export function searchText(text: string, folded: string, query: string, limit = MAX_SEARCH_HITS) {
  const q = foldAscii(query.trim());
  const hits: SearchHit[] = [];
  if (!q) return { hits, truncated: false };
  let from = 0;
  while (hits.length < limit) {
    const i = folded.indexOf(q, from);
    if (i === -1) return { hits, truncated: false };
    hits.push({
      offset: i,
      before: oneLine(text.slice(Math.max(0, i - CONTEXT), i)).trimStart(),
      match: text.slice(i, i + q.length),
      after: oneLine(text.slice(i + q.length, i + q.length + CONTEXT * 2)).trimEnd(),
    });
    from = i + q.length;
  }
  return { hits, truncated: folded.indexOf(q, from) !== -1 };
}

/** Short one-line excerpt starting at `offset`, for bookmark lists. */
export function excerptAt(text: string, offset: number, length = 48): string {
  let s = offset;
  while (s < text.length && /[\s　]/.test(text[s]!)) s++;
  return oneLine(text.slice(s, s + length)).trim();
}
