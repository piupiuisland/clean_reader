import { BookOpen, Ellipsis, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ask } from '../../app/dialogStore';
import { useShelf } from '../../app/shelfStore';
import { relativeTime } from '../../domain/books/relativeTime';
import { formatPercent } from '../../domain/progress/progress';
import { navigate } from '../../hooks/useHashRoute';
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>书架</h1>
        <button className={styles.iconButton} onClick={pick} disabled={importing} aria-label="导入 TXT">
          <Plus size={24} strokeWidth={2} />
        </button>
      </header>

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
        <ul className={styles.grid}>
          {books.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookCard({ book }: { book: BookSummary }) {
  const { rename, remove } = useShelf();

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

  return (
    <li className={styles.card}>
      <button className={styles.open} onClick={() => navigate({ name: 'reader', bookId: book.id })}>
        <Cover title={book.title} />
        <span className={styles.title}>{book.title}</span>
      </button>
      <div className={styles.metaRow}>
        <span className={styles.meta}>
          {formatPercent(book.progressOffset, book.length)}
          {book.lastOpenedAt ? ` · ${relativeTime(book.lastOpenedAt)}` : ''}
        </span>
        <button className={styles.more} onClick={openMenu} aria-label={`${book.title} 更多操作`}>
          <Ellipsis size={18} />
        </button>
      </div>
    </li>
  );
}
