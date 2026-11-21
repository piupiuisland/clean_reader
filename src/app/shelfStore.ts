import { create } from 'zustand';
import { findDuplicate, parseTxtFile } from '../services/import/importTxt';
import { bookRepository, type BookSummary } from '../services/storage/bookRepository';
import { ask, toast } from './dialogStore';

interface ShelfState {
  books: BookSummary[];
  loaded: boolean;
  importing: boolean;
  refresh: () => Promise<void>;
  importFiles: (files: File[]) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useShelf = create<ShelfState>((set, get) => ({
  books: [],
  loaded: false,
  importing: false,

  refresh: async () => {
    try {
      set({ books: await bookRepository.list(), loaded: true });
    } catch (e) {
      set({ loaded: true });
      toast(`读取书架失败：${errMsg(e)}`, 'error');
    }
  },

  importFiles: async (files) => {
    if (!files.length) return;
    set({ importing: true });
    let imported = 0;
    try {
      for (const file of files) {
        try {
          const parsed = await parseTxtFile(file);
          const dup = await findDuplicate(bookRepository, parsed);

          if (dup?.kind === 'identical') {
            const r = await ask({
              title: '书籍已存在',
              message: `《${dup.existing.title}》已在书架中，内容完全相同。`,
              actions: [
                { label: '仍然导入一份', value: 'add' },
                { label: '跳过', value: 'skip', style: 'cancel' },
              ],
            });
            if (r.action !== 'add') continue;
          } else if (dup?.kind === 'sameTitle') {
            const r = await ask({
              title: '发现同名书籍',
              message: `书架中已有《${dup.existing.title}》，但内容不同（例如连载更新）。`,
              actions: [
                { label: '替换（保留阅读进度）', value: 'replace', style: 'primary' },
                { label: '两本都保留', value: 'add' },
                { label: '取消', value: 'skip', style: 'cancel' },
              ],
            });
            if (r.action === 'replace') {
              await bookRepository.replace(dup.existing.id, parsed.book, parsed.text);
              imported++;
              continue;
            }
            if (r.action !== 'add') continue;
          }

          await bookRepository.add(parsed.book, parsed.text);
          imported++;
        } catch (e) {
          // Report and continue with the remaining files — never abort silently.
          await ask({
            title: `无法导入 ${file.name}`,
            message: errMsg(e),
            actions: [{ label: '好', value: 'ok', style: 'primary' }],
          });
        }
      }
    } finally {
      set({ importing: false });
      await get().refresh();
    }
    if (imported) toast(imported === 1 ? '已导入 1 本书' : `已导入 ${imported} 本书`);
  },

  rename: async (id, title) => {
    try {
      await bookRepository.rename(id, title);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
    await get().refresh();
  },

  remove: async (id) => {
    try {
      await bookRepository.remove(id);
    } catch (e) {
      toast(`删除失败：${errMsg(e)}`, 'error');
    }
    await get().refresh();
  },
}));
