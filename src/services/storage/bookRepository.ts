import { clampOffset } from '../../domain/progress/progress';
import { db as defaultDb, type BookmarkRecord, type BookRecord, type ReaderDB } from './db';

export interface BookSummary extends BookRecord {
  progressOffset: number;
}

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

function wrap(err: unknown, action: string): StorageError {
  const name = (err as { name?: string; inner?: { name?: string } })?.name;
  const inner = (err as { inner?: { name?: string } })?.inner?.name;
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return new StorageError(`${action}失败：设备存储空间不足。请删除一些书籍后重试。`, err);
  }
  return new StorageError(`${action}失败：${(err as Error)?.message ?? String(err)}`, err);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* randomUUID is unavailable in insecure contexts on some browsers */
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type NewBook = Omit<BookRecord, 'id' | 'createdAt' | 'lastOpenedAt'>;

export function createBookRepository(db: ReaderDB = defaultDb) {
  return {
    async list(): Promise<BookSummary[]> {
      const [books, progress] = await Promise.all([db.books.toArray(), db.progress.toArray()]);
      const byId = new Map(progress.map((p) => [p.bookId, p.offset]));
      return books
        .map((b) => ({ ...b, progressOffset: byId.get(b.id) ?? 0 }))
        .sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt));
    },

    async get(id: string): Promise<BookRecord | undefined> {
      return db.books.get(id);
    },

    async findByHash(contentHash: string): Promise<BookRecord | undefined> {
      return db.books.where('contentHash').equals(contentHash).first();
    },

    async findByTitle(title: string): Promise<BookRecord | undefined> {
      return db.books.where('title').equals(title).first();
    },

    async add(book: NewBook, text: string): Promise<BookRecord> {
      const record: BookRecord = { ...book, id: newId(), createdAt: Date.now(), lastOpenedAt: null };
      try {
        await db.transaction('rw', db.books, db.contents, async () => {
          await db.books.add(record);
          await db.contents.add({ bookId: record.id, text });
        });
      } catch (err) {
        throw wrap(err, '保存书籍');
      }
      return record;
    },

    /**
     * Replace an existing book's content (e.g. an updated serial novel) while
     * keeping its id, display title and reading progress (clamped to new length).
     */
    async replace(id: string, book: NewBook, text: string): Promise<void> {
      try {
        await db.transaction('rw', [db.books, db.contents, db.progress, db.bookmarks], async () => {
          const existing = await db.books.get(id);
          if (!existing) throw new Error('原书籍不存在');
          await db.books.put({ ...existing, ...book, title: existing.title });
          await db.contents.put({ bookId: id, text });
          const p = await db.progress.get(id);
          if (p) await db.progress.put({ ...p, offset: clampOffset(p.offset, book.length) });
          await db.bookmarks
            .where('bookId')
            .equals(id)
            .modify((b) => {
              b.offset = clampOffset(b.offset, book.length);
            });
        });
      } catch (err) {
        throw wrap(err, '替换书籍');
      }
    },

    async rename(id: string, title: string): Promise<void> {
      const clean = title.trim();
      if (!clean) throw new StorageError('书名不能为空。');
      await db.books.update(id, { title: clean });
    },

    async remove(id: string): Promise<void> {
      await db.transaction('rw', [db.books, db.contents, db.progress, db.bookmarks], async () => {
        await db.books.delete(id);
        await db.contents.delete(id);
        await db.progress.delete(id);
        await db.bookmarks.where('bookId').equals(id).delete();
      });
    },

    async getText(id: string): Promise<string | undefined> {
      return (await db.contents.get(id))?.text;
    },

    async getProgress(id: string): Promise<number> {
      return (await db.progress.get(id))?.offset ?? 0;
    },

    async saveProgress(id: string, offset: number): Promise<void> {
      await db.progress.put({ bookId: id, offset, updatedAt: Date.now() });
    },

    async markOpened(id: string): Promise<void> {
      await db.books.update(id, { lastOpenedAt: Date.now() });
    },

    /** Bookmarks of a book in reading order. */
    async listBookmarks(bookId: string): Promise<BookmarkRecord[]> {
      return (await db.bookmarks.where('bookId').equals(bookId).toArray()).sort((a, b) => a.offset - b.offset);
    },

    async addBookmark(bookId: string, offset: number, excerpt: string): Promise<BookmarkRecord> {
      const rec = { bookId, offset, excerpt, createdAt: Date.now() };
      try {
        const id = await db.bookmarks.add(rec as BookmarkRecord);
        return { ...rec, id: id as number };
      } catch (err) {
        throw wrap(err, '添加书签');
      }
    },

    async removeBookmarks(ids: number[]): Promise<void> {
      await db.bookmarks.bulkDelete(ids);
    },
  };
}

export type BookRepository = ReturnType<typeof createBookRepository>;
export const bookRepository = createBookRepository();
