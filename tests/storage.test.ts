import { beforeEach, describe, expect, it } from 'vitest';
import { findDuplicate, parseTxtFile } from '../src/services/import/importTxt';
import { createBookRepository, type BookRepository } from '../src/services/storage/bookRepository';
import { createDb } from '../src/services/storage/db';

let repo: BookRepository;
let n = 0;

beforeEach(() => {
  repo = createBookRepository(createDb(`test-${n++}`));
});

const txt = (name: string, content: string | Uint8Array) =>
  new File([content as BlobPart], name, { type: 'text/plain' });

describe('import + repository', () => {
  it('imports a TXT file and reopens it with progress', async () => {
    const parsed = await parseTxtFile(txt('测试.txt', '第一章\r\n　　正文内容。'));
    expect(parsed.text).toBe('第一章\n　　正文内容。');
    const rec = await repo.add(parsed.book, parsed.text);

    await repo.saveProgress(rec.id, 7);
    await repo.markOpened(rec.id);

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('测试');
    expect(list[0]!.progressOffset).toBe(7);
    expect(list[0]!.lastOpenedAt).not.toBeNull();
    expect(await repo.getText(rec.id)).toBe(parsed.text);
  });

  it('detects identical and same-title duplicates', async () => {
    const a = await parseTxtFile(txt('书.txt', '内容一'));
    await repo.add(a.book, a.text);

    expect((await findDuplicate(repo, a))?.kind).toBe('identical');
    const b = await parseTxtFile(txt('书.txt', '内容一，更新了'));
    expect((await findDuplicate(repo, b))?.kind).toBe('sameTitle');
    const c = await parseTxtFile(txt('别的书.txt', '完全不同'));
    expect(await findDuplicate(repo, c)).toBeNull();
  });

  it('replace keeps id, custom title and clamps progress', async () => {
    const a = await parseTxtFile(txt('书.txt', '一二三四五六七八九十'));
    const rec = await repo.add(a.book, a.text);
    await repo.rename(rec.id, '我的书');
    await repo.saveProgress(rec.id, 9);

    const b = await parseTxtFile(txt('书.txt', '一二三'));
    await repo.replace(rec.id, b.book, b.text);

    const [book] = await repo.list();
    expect(book!.id).toBe(rec.id);
    expect(book!.title).toBe('我的书');
    expect(book!.length).toBe(3);
    expect(book!.progressOffset).toBe(2);
    expect(await repo.getText(rec.id)).toBe('一二三');
  });

  it('remove deletes book, content and progress', async () => {
    const a = await parseTxtFile(txt('a.txt', 'hello'));
    const rec = await repo.add(a.book, a.text);
    await repo.saveProgress(rec.id, 3);
    await repo.remove(rec.id);
    expect(await repo.list()).toEqual([]);
    expect(await repo.getText(rec.id)).toBeUndefined();
    expect(await repo.getProgress(rec.id)).toBe(0);
  });

  it('stores bookmarks in reading order and removes them with the book', async () => {
    const a = await parseTxtFile(txt('a.txt', '一二三四五六七八九十'));
    const rec = await repo.add(a.book, a.text);
    const b2 = await repo.addBookmark(rec.id, 8, '九十');
    await repo.addBookmark(rec.id, 2, '三四');
    expect((await repo.listBookmarks(rec.id)).map((b) => b.offset)).toEqual([2, 8]);

    // Replacing with shorter content clamps bookmark offsets.
    const short = await parseTxtFile(txt('a.txt', '一二三四五'));
    await repo.replace(rec.id, short.book, short.text);
    expect((await repo.listBookmarks(rec.id)).map((b) => b.offset)).toEqual([2, 4]);

    await repo.removeBookmarks([b2.id]);
    expect(await repo.listBookmarks(rec.id)).toHaveLength(1);
    await repo.remove(rec.id);
    expect(await repo.listBookmarks(rec.id)).toEqual([]);
  });

  it('upgrades a v1 database without losing books', async () => {
    const Dexie = (await import('dexie')).default;
    const name = `legacy-${n++}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ books: 'id, contentHash, title, createdAt, lastOpenedAt', contents: 'bookId', progress: 'bookId' });
    await v1.table('books').add({ id: 'x', title: '旧书', fileName: 'x.txt', fileSize: 3, length: 3, encoding: 'utf-8', contentHash: 'h', createdAt: 1, lastOpenedAt: null });
    await v1.table('progress').put({ bookId: 'x', offset: 2, updatedAt: 1 });
    v1.close();

    const upgraded = createBookRepository(createDb(name));
    const [book] = await upgraded.list();
    expect(book!.title).toBe('旧书');
    expect(book!.progressOffset).toBe(2);
    expect(await upgraded.listBookmarks('x')).toEqual([]);
  });

  it('rejects empty names and unsupported files', async () => {
    const a = await parseTxtFile(txt('a.txt', 'hello'));
    const rec = await repo.add(a.book, a.text);
    await expect(repo.rename(rec.id, '   ')).rejects.toThrow();
    await expect(parseTxtFile(new File(['x'], 'cover.png', { type: 'image/png' }))).rejects.toThrow(/txt/);
    await expect(parseTxtFile(txt('blank.txt', '  \n\n  '))).rejects.toThrow();
  });

  it('imports GBK-encoded files', async () => {
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]); // 中文
    const parsed = await parseTxtFile(txt('gbk.txt', gbk));
    expect(parsed.text).toBe('中文');
    expect(parsed.book.encoding).toBe('gb18030');
  });
});

import { createSettingsRepository } from '../src/services/storage/settingsRepository';
import { sanitizeReaderSettings } from '../src/domain/settings/readerSettings';

describe('reader settings', () => {
  it('saves, loads and sanitizes', async () => {
    const s = createSettingsRepository(createDb(`settings-${n++}`));
    expect((await s.loadReader()).fontSize).toBe(19);
    await s.saveReader({ fontSize: 24, theme: 'green', font: 'kai' });
    expect(await s.loadReader()).toEqual({ fontSize: 24, theme: 'green', font: 'kai' });
    expect(sanitizeReaderSettings({ fontSize: 99 }).fontSize).toBe(30);
    expect(sanitizeReaderSettings({ fontSize: 'x' }).fontSize).toBe(19);
    expect(sanitizeReaderSettings(null)).toEqual({ fontSize: 19, theme: 'soft-dark', font: 'song' });
    // A theme removed in an update falls back to the default.
    expect(sanitizeReaderSettings({ theme: 'auto', font: 'comic' })).toMatchObject({ theme: 'soft-dark', font: 'song' });
  });
});
