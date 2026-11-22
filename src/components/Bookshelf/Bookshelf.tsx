import { BookOpen, DatabaseBackup, Ellipsis, Plus } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { ask, toast } from '../../app/dialogStore';
import { useSettings } from '../../app/settingsStore';
import { useShelf } from '../../app/shelfStore';
import { formatFileSize } from '../../domain/books/fileSize';
import { relativeTime } from '../../domain/books/relativeTime';
import { formatPercent } from '../../domain/progress/progress';
import { navigate } from '../../hooks/useHashRoute';
import { exportBackup, parseBackup, restoreBackup, saveBackupFile } from '../../services/backup/backup';
import type { BookSummary } from '../../services/storage/bookRepository';
import styles from './Bookshelf.module.css';
import { Cover } from './Cover';

export function Bookshelf() {
  const { books, loaded, importing, refresh, importFiles } = useShelf();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pick = () => fileRef.current?.click();
  const backupRef = useRef<HTMLInputElement>(null);

  const openBackup = async () => {
    const r = await ask({
      title: '阅读数据备份',
      message: '备份阅读进度、书签和阅读设置（不含书籍文件）。在新设备上先导入同样的 TXT，再导入备份即可恢复。',
      variant: 'sheet',
      actions: [
        { label: '导出备份', value: 'export' },
        { label: '导入备份', value: 'import' },
        { label: '取消', value: 'cancel', style: 'cancel' },
      ],
    });
    if (r.action === 'export') {
      try {
        if (await saveBackupFile(await exportBackup())) toast('备份已导出');
      } catch (e) {
        toast(`导出失败：${(e as Error)?.message ?? e}`, 'error');
      }
    } else if (r.action === 'import') {
      backupRef.current?.click();
    }
  };

  const importBackup = async (file: File) => {
    try {
      const res = await restoreBackup(parseBackup(await file.text()));
      await Promise.all([refresh(), useSettings.getState().reload()]);
      const lines = [
        `已恢复 ${res.matchedBooks} 本书的数据：${res.progressRestored} 条阅读进度，${res.bookmarksAdded} 个新书签。`,
      ];
      if (res.missingTitles.length) {
        const shown = res.missingTitles.slice(0, 5).map((t) => `《${t}》`).join('、');
        const more = res.missingTitles.length > 5 ? ` 等 ${res.missingTitles.length} 本` : '';
        lines.push(`书架上没有 ${shown}${more}，导入对应 TXT 后再导入一次备份即可恢复。`);
      }
      await ask({ title: '备份已导入', message: lines.join('\n'), actions: [{ label: '好', value: 'ok', style: 'primary' }] });
    } catch (e) {
      toast(`导入失败：${(e as Error)?.message ?? e}`, 'error');
    }
  };

  return (
    <div className={styles.page}>
      {/* Solid strip behind the status bar so the list scrolls underneath it. */}
      <div className={styles.statusBar} aria-hidden="true" />
      <header className={styles.header}>
        <h1 className={styles.heading}>书架</h1>
        <div className={styles.actions}>
          <button className={styles.iconButton} onClick={openBackup} aria-label="阅读数据备份">
            <DatabaseBackup size={22} />
          </button>
          <button className={styles.iconButton} onClick={pick} disabled={importing} aria-label="导入 TXT">
            <Plus size={24} strokeWidth={2} />
          </button>
        </div>
      </header>

      <input
        ref={backupRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        aria-label="选择备份文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importBackup(file);
        }}
      />

      <input
        ref={fileRef}
        type="file"
        // iOS Files app: list the MIME type too, or .txt files may be greyed out.
        accept=".txt,text/plain"
        multiple
        className="visually-hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ''; // allow re-importing the same file
          void importFiles(files);
        }}
      />

      {importing && <div className={styles.importing}>正在导入…</div>}

      {loaded && books.length === 0 ? (
        <div className={styles.empty}>
          <BookOpen size={44} strokeWidth={1.25} />
          <p>书架还是空的</p>
          <button className={styles.emptyButton} onClick={pick}>
            导入 TXT 文件
          </button>
          <small>支持 UTF-8 与 GBK/GB18030 编码</small>
        </div>
      ) : (
        <ul className={styles.list}>
          {books.map((b) => (
            <BookRow key={b.id} book={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookRow({ book }: { book: BookSummary }) {
  const { rename, remove } = useShelf();
  const id = useId();

  const openMenu = async () => {
    const r = await ask({
      title: book.title,
      variant: 'sheet',
      actions: [
        { label: '重命名', value: 'rename' },
        { label: '删除', value: 'delete', style: 'danger' },
        { label: '取消', value: 'cancel', style: 'cancel' },
      ],
    });
    if (r.action === 'rename') {
      const n = await ask({
        title: '重命名',
        input: { initial: book.title, placeholder: '书名' },
        actions: [
          { label: '保存', value: 'save', style: 'primary' },
          { label: '取消', value: 'cancel', style: 'cancel' },
        ],
      });
      if (n.action === 'save' && n.text.trim() && n.text.trim() !== book.title) await rename(book.id, n.text);
    } else if (r.action === 'delete') {
      const c = await ask({
        title: `删除《${book.title}》？`,
        message: '书籍内容和阅读进度将从本设备移除，且无法恢复。',
        actions: [
          { label: '删除', value: 'delete', style: 'danger' },
          { label: '取消', value: 'cancel', style: 'cancel' },
        ],
      });
      if (c.action === 'delete') await remove(book.id);
    }
  };

  const meta = [
    formatPercent(book.progressOffset, book.length),
    book.lastOpenedAt ? relativeTime(book.lastOpenedAt) : null,
    formatFileSize(book.fileSize),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={styles.row}>
      <button
        className={styles.open}
        onClick={() => navigate({ name: 'reader', bookId: book.id })}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-m`}
      >
        <Cover title={book.title} />
        <span className={styles.text}>
          <span id={`${id}-t`} className={styles.title}>
            {book.title}
          </span>
          <span id={`${id}-m`} className={styles.meta}>
            {meta}
          </span>
        </span>
      </button>
      <button className={styles.more} onClick={openMenu} aria-label={`${book.title} 更多操作`}>
        <Ellipsis size={20} />
      </button>
    </li>
  );
}
