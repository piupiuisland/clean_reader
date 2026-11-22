import { clampOffset } from '../../domain/progress/progress';
import { sanitizeReaderSettings, type ReaderSettings } from '../../domain/settings/readerSettings';
import { db as defaultDb, type BookmarkRecord, type ReaderDB } from '../storage/db';

/**
 * Reading-data backup: progress, bookmarks and reader settings — not the book
 * files themselves (those can be hundreds of MB). Books are matched by the hash
 * of their normalized text, so a backup can be restored after re-importing the
 * same TXT on another phone, even under a different file name or title.
 */
export const BACKUP_APP = 'pure-reader-lite';
export const BACKUP_VERSION = 1;

export interface BackupBook {
  contentHash: string;
  length: number;
  title: string;
  progress?: { offset: number; updatedAt: number };
  bookmarks: { offset: number; excerpt: string; createdAt: number }[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  settings?: ReaderSettings;
  books: BackupBook[];
}

export interface RestoreResult {
  /** Books on this device that received data from the backup. */
  matchedBooks: number;
  /** Titles from the backup with no matching book on this device. */
  missingTitles: string[];
  bookmarksAdded: number;
  progressRestored: number;
  settingsRestored: boolean;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function exportBackup(db: ReaderDB = defaultDb): Promise<BackupFile> {
  const [books, progress, bookmarks, settings] = await Promise.all([
    db.books.toArray(),
    db.progress.toArray(),
    db.bookmarks.toArray(),
    db.settings.get('reader'),
  ]);
  const progressById = new Map(progress.map((p) => [p.bookId, p]));
  const marksById = new Map<string, BookmarkRecord[]>();
  for (const m of bookmarks) marksById.set(m.bookId, [...(marksById.get(m.bookId) ?? []), m]);

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    settings: settings ? sanitizeReaderSettings(settings.value) : undefined,
    books: books.map((b) => {
      const p = progressById.get(b.id);
      return {
        contentHash: b.contentHash,
        length: b.length,
        title: b.title,
        ...(p && { progress: { offset: p.offset, updatedAt: p.updatedAt } }),
        bookmarks: (marksById.get(b.id) ?? [])
          .sort((x, y) => x.offset - y.offset)
          .map(({ offset, excerpt, createdAt }) => ({ offset, excerpt, createdAt })),
      };
    }),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Validates an untrusted backup file. Throws BackupError with a readable message. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('这不是有效的备份文件（无法解析）。');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !Array.isArray(raw.books)) {
    throw new BackupError('这不是 PureReader 的备份文件。');
  }
  if (num(raw.version) > BACKUP_VERSION) {
    throw new BackupError('备份文件来自更新版本的 PureReader，请先更新应用。');
  }
  const books: BackupBook[] = [];
  for (const b of raw.books) {
    if (!isObj(b) || typeof b.contentHash !== 'string') continue;
    const p = isObj(b.progress) ? b.progress : undefined;
    books.push({
      contentHash: b.contentHash,
      length: num(b.length),
      title: typeof b.title === 'string' ? b.title : '未命名',
      ...(p && { progress: { offset: num(p.offset), updatedAt: num(p.updatedAt) } }),
      bookmarks: (Array.isArray(b.bookmarks) ? b.bookmarks : []).filter(isObj).map((m) => ({
        offset: num(m.offset),
        excerpt: typeof m.excerpt === 'string' ? m.excerpt : '',
        createdAt: num(m.createdAt),
      })),
    });
  }
  return {
    app: BACKUP_APP,
    version: num(raw.version, BACKUP_VERSION),
    exportedAt: num(raw.exportedAt),
    settings: raw.settings === undefined ? undefined : sanitizeReaderSettings(raw.settings),
    books,
  };
}

/**
 * Merges a backup into this device without deleting anything:
 * - progress: the more recently read position wins;
 * - bookmarks: added unless one already exists at the same position;
 * - settings: replaced by the backup's.
 */
export async function restoreBackup(backup: BackupFile, db: ReaderDB = defaultDb): Promise<RestoreResult> {
  const result: RestoreResult = {
    matchedBooks: 0,
    missingTitles: [],
    bookmarksAdded: 0,
    progressRestored: 0,
    settingsRestored: false,
  };
  await db.transaction('rw', [db.books, db.progress, db.bookmarks, db.settings], async () => {
    for (const entry of backup.books) {
      const locals = await db.books.where('contentHash').equals(entry.contentHash).toArray();
      if (!locals.length) {
        result.missingTitles.push(entry.title);
        continue;
      }
      for (const book of locals) {
        result.matchedBooks++;
        if (entry.progress) {
          const local = await db.progress.get(book.id);
          if (!local || entry.progress.updatedAt > local.updatedAt) {
            await db.progress.put({
              bookId: book.id,
              offset: clampOffset(entry.progress.offset, book.length),
              updatedAt: entry.progress.updatedAt,
            });
            result.progressRestored++;
          }
        }
        const existing = new Set(
          (await db.bookmarks.where('bookId').equals(book.id).toArray()).map((m) => m.offset),
        );
        for (const m of entry.bookmarks) {
          const offset = clampOffset(m.offset, book.length);
          if (existing.has(offset)) continue;
          existing.add(offset);
          await db.bookmarks.add({ bookId: book.id, offset, excerpt: m.excerpt, createdAt: m.createdAt } as BookmarkRecord);
          result.bookmarksAdded++;
        }
      }
    }
    if (backup.settings) {
      await db.settings.put({ key: 'reader', value: backup.settings });
      result.settingsRestored = true;
    }
  });
  return result;
}

export function backupFileName(date = new Date()): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `PureReader-备份-${d}.json`;
}

/**
 * Hands the file to the user. On iPhone the share sheet ("存储到文件") is the
 * reliable route, especially in a home-screen app; elsewhere a download.
 * Resolves false if the user cancelled the share sheet.
 */
export async function saveBackupFile(backup: BackupFile): Promise<boolean> {
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return false;
      // Share failed for another reason: fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
