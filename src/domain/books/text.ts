/**
 * Canonical book text. All stored offsets (progress, bookmarks) index into the
 * *normalized* text, so normalization must happen exactly once, at import time.
 */
export function normalizeText(raw: string): string {
  let t = raw;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n?/g, '\n');
}

/** Book title derived from a file name: strip extension and common noise. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  // 《书名》 → 书名
  const m = base.match(/^《(.+?)》/);
  return (m ? m[1]! : base) || '未命名';
}

/** Fast non-cryptographic 53-bit hash (cyrb53). Works over plain http (no crypto.subtle). */
export function hashText(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0') + '-' + str.length.toString(16);
}
