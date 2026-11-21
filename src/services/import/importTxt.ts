import { hashText, normalizeText, titleFromFileName } from '../../domain/books/text';
import type { BookRecord } from '../storage/db';
import type { BookRepository, NewBook } from '../storage/bookRepository';
import { decodeText, UnsupportedFileError } from './decode';

/** Hard cap to protect low-memory devices. ~200 MB of UTF-8 Chinese is >60M chars. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export interface ParsedBook {
  book: NewBook;
  text: string;
}

export type Duplicate =
  | { kind: 'identical'; existing: BookRecord }
  | { kind: 'sameTitle'; existing: BookRecord };

export async function parseTxtFile(file: File): Promise<ParsedBook> {
  const isTxtName = /\.txt$/i.test(file.name);
  const isTextType = file.type === '' || file.type.startsWith('text/');
  if (!isTxtName && !isTextType) {
    throw new UnsupportedFileError(`暂不支持该文件类型（${file.name}）。目前只支持 .txt 文件。`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UnsupportedFileError(`文件太大（${(file.size / 1048576).toFixed(0)} MB），上限为 200 MB。`);
  }
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    throw new UnsupportedFileError('无法读取文件。如果文件存放在 iCloud，请先在“文件”App 中下载它。');
  }
  const { text: raw, encoding } = decodeText(buf);
  const text = normalizeText(raw);
  if (!text.trim()) throw new UnsupportedFileError('文件没有可阅读的文字内容。');

  return {
    text,
    book: {
      title: titleFromFileName(file.name),
      fileName: file.name,
      fileSize: file.size,
      length: text.length,
      encoding,
      contentHash: hashText(text),
    },
  };
}

export async function findDuplicate(repo: BookRepository, parsed: ParsedBook): Promise<Duplicate | null> {
  const identical = await repo.findByHash(parsed.book.contentHash);
  if (identical) return { kind: 'identical', existing: identical };
  const sameTitle = await repo.findByTitle(parsed.book.title);
  if (sameTitle) return { kind: 'sameTitle', existing: sameTitle };
  return null;
}
