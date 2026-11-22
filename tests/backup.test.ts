import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, parseBackup, restoreBackup } from '../src/services/backup/backup';
import { parseTxtFile } from '../src/services/import/importTxt';
import { createBookRepository } from '../src/services/storage/bookRepository';
import { createDb } from '../src/services/storage/db';
import { createSettingsRepository } from '../src/services/storage/settingsRepository';

let n = 0;
const txt = (name: string, content: string) => new File([content], name, { type: 'text/plain' });
const BOOK_A = '第一章\n' + '　　甲'.repeat(500);
const BOOK_B = '第一章\n' + '　　乙'.repeat(500);

async function device() {
  const db = createDb(`backup-${n++}`);
  return { db, repo: createBookRepository(db), settings: createSettingsRepository(db) };
}

async function addBook(repo: ReturnType<typeof createBookRepository>, name: string, content: string) {
  const p = await parseTxtFile(txt(name, content));
  return repo.add(p.book, p.text);
}

describe('backup', () => {
  it('round-trips progress, bookmarks and settings to a new device, matching books by content', async () => {
    const a = await device();
    const bookA = await addBook(a.repo, 'A.txt', BOOK_A);
    const bookB = await addBook(a.repo, 'B.txt', BOOK_B);
    await a.repo.saveProgress(bookA.id, 700);
    await a.repo.addBookmark(bookA.id, 100, '甲甲');
    await a.repo.addBookmark(bookA.id, 900, '甲甲甲');
    await a.repo.addBookmark(bookB.id, 50, '乙');
    await a.settings.saveReader({ fontSize: 24, theme: 'dark-3', font: 'kai' });

    const file = JSON.stringify(await exportBackup(a.db));

    // New phone: only book A re-imported, under another file name.
    const b = await device();
    const copyA = await addBook(b.repo, '另一个名字.txt', BOOK_A);
    await b.repo.addBookmark(copyA.id, 100, '已存在'); // duplicate position: kept once
    const res = await restoreBackup(parseBackup(file), b.db);

    expect(res).toMatchObject({ matchedBooks: 1, missingTitles: ['B'], bookmarksAdded: 1, progressRestored: 1, settingsRestored: true });
    expect(await b.repo.getProgress(copyA.id)).toBe(700);
    expect((await b.repo.listBookmarks(copyA.id)).map((m) => m.offset)).toEqual([100, 900]);
    expect(await b.settings.loadReader()).toEqual({ fontSize: 24, theme: 'dark-3', font: 'kai' });

    // Restoring twice adds nothing new.
    const again = await restoreBackup(parseBackup(file), b.db);
    expect(again.bookmarksAdded).toBe(0);
    expect(again.progressRestored).toBe(0);
  });

  it('keeps a newer local position', async () => {
    const a = await device();
    const book = await addBook(a.repo, 'A.txt', BOOK_A);
    await a.repo.saveProgress(book.id, 100);
    const file = JSON.stringify(await exportBackup(a.db));
    await new Promise((r) => setTimeout(r, 5));
    await a.repo.saveProgress(book.id, 800);
    await restoreBackup(parseBackup(file), a.db);
    expect(await a.repo.getProgress(book.id)).toBe(800);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"books":[]}')).toThrow('不是 PureReader 的备份文件');
    expect(() => parseBackup('{"app":"pure-reader-lite","version":99,"books":[]}')).toThrow('更新版本');
  });
});
