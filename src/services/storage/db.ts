import Dexie, { type EntityTable } from 'dexie';
import type { TextEncodingName } from '../import/decode';

export interface BookRecord {
  id: string;
  title: string;
  fileName: string;
  /** Size of the original file in bytes. */
  fileSize: number;
  /** Length of the normalized text in UTF-16 code units. */
  length: number;
  encoding: TextEncodingName;
  contentHash: string;
  createdAt: number;
  lastOpenedAt: number | null;
}

export interface BookContentRecord {
  bookId: string;
  text: string;
}

export interface ProgressRecord {
  bookId: string;
  /** Stable character offset into the normalized text. */
  offset: number;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: number;
  bookId: string;
  /** Stable character offset of the bookmarked page's first character. */
  offset: number;
  /** Short text snippet shown in the bookmark list. */
  excerpt: string;
  createdAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type ReaderDB = Dexie & {
  books: EntityTable<BookRecord, 'id'>;
  contents: EntityTable<BookContentRecord, 'bookId'>;
  progress: EntityTable<ProgressRecord, 'bookId'>;
  bookmarks: EntityTable<BookmarkRecord, 'id'>;
  settings: EntityTable<SettingRecord, 'key'>;
};

export const DB_NAME = 'pure-reader-lite';

/**
 * Schema history. Never edit a released version — add a new `.version(n)`
 * with an `.upgrade()` instead, so existing users keep their data.
 */
export function createDb(name = DB_NAME): ReaderDB {
  const db = new Dexie(name) as ReaderDB;
  db.version(1).stores({
    // Book content is kept in its own table so listing the shelf never loads whole books.
    books: 'id, contentHash, title, createdAt, lastOpenedAt',
    contents: 'bookId',
    progress: 'bookId',
  });
  // v2: bookmarks. Additive, so no upgrade function is needed.
  db.version(2).stores({
    bookmarks: '++id, bookId',
  });
  // v3: key/value settings (reader typography etc.).
  db.version(3).stores({
    settings: 'key',
  });
  return db;
}

export const db = createDb();

/** Ask the browser not to evict our storage. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
