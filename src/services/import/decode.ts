/**
 * Text decoding for imported TXT files.
 *
 * Strategy:
 *  1. Honour a byte-order mark (UTF-8 / UTF-16 LE / UTF-16 BE).
 *  2. Try strict UTF-8 — it fails fast on GBK byte sequences.
 *  3. Fall back to GB18030 (a superset of GBK/GB2312). Safari, Chrome and
 *     Firefox all ship a native GB18030 TextDecoder, so no library is needed.
 *  4. Reject data that looks binary or decodes to mostly garbage.
 */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

const SNIFF_BYTES = 8192;
/** Max share of U+FFFD replacement chars tolerated in a GB18030 decode. */
const MAX_REPLACEMENT_RATIO = 0.01;

export function detectBom(bytes: Uint8Array): TextEncodingName | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, SNIFF_BYTES);
  let controls = 0;
  for (let i = 0; i < end; i++) {
    const b = bytes[i]!;
    if (b === 0x00) return true;
    // Control chars other than \t \n \r \f \v and ESC are suspicious.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c && b !== 0x0b && b !== 0x1b) {
      controls++;
    }
  }
  return end > 0 && controls / end > 0.05;
}

export function decodeText(input: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) throw new UnsupportedFileError('文件是空的。');

  const bom = detectBom(bytes);
  if (bom) {
    // TextDecoder strips the BOM itself (ignoreBOM defaults to false).
    return { text: new TextDecoder(bom).decode(bytes), encoding: bom };
  }

  if (looksBinary(bytes)) {
    throw new UnsupportedFileError('这看起来不是纯文本文件。');
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // Not valid UTF-8 — fall through to GB18030.
  }

  let text: string;
  try {
    text = new TextDecoder('gb18030').decode(bytes);
  } catch {
    throw new UnsupportedFileError('当前浏览器不支持 GBK/GB18030 解码。');
  }
  let bad = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) bad++;
  if (bad / text.length > MAX_REPLACEMENT_RATIO) {
    throw new UnsupportedFileError('无法识别文件编码（支持 UTF-8、UTF-16、GBK/GB18030）。');
  }
  return { text, encoding: 'gb18030' };
}
