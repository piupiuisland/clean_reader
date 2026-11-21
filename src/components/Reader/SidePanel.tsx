import { Bookmark, Search, TableOfContents, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter } from '../../domain/books/chapters';
import { foldAscii, searchText } from '../../domain/books/search';
import { percentLabel, progressPercent } from '../../domain/progress/progress';
import type { BookmarkRecord } from '../../services/storage/db';
import styles from './SidePanel.module.css';

export type PanelTab = 'outline' | 'marks' | 'search';

const TABS: { id: PanelTab; label: string; Icon: typeof Bookmark }[] = [
  { id: 'outline', label: '目录', Icon: TableOfContents },
  { id: 'marks', label: '书签', Icon: Bookmark },
  { id: 'search', label: '搜索', Icon: Search },
];

interface Props {
  open: boolean;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  onJump: (offset: number) => void;
  text: string;
  chapters: Chapter[];
  currentChapter: number;
  bookmarks: BookmarkRecord[];
  onDeleteBookmark: (id: number) => void;
}

export function SidePanel(props: Props) {
  const { open, tab, onTab, onClose } = props;
  const touchX = useRef<number | null>(null);

  return (
    <div className={`${styles.root} ${open ? styles.open : ''}`} aria-hidden={!open}>
      <div className={styles.scrim} onClick={onClose} />
      <aside
        className={styles.panel}
        role="dialog"
        aria-label="书签"
        onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
        onTouchEnd={(e) => {
          // Swipe back to the right closes the panel.
          const x0 = touchX.current;
          const x1 = e.changedTouches[0]?.clientX;
          if (x0 !== null && x1 !== undefined && x1 - x0 > 60) onClose();
          touchX.current = null;
        }}
      >
        <header className={styles.header}>
          <span>{TABS.find((t) => t.id === tab)!.label}</span>
          <button className={styles.iconBtn} onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        <div className={styles.body}>
          {tab === 'outline' && <Outline {...props} />}
          {tab === 'marks' && <Marks {...props} />}
          {/* Search stays mounted so the query and results survive tab switches. */}
          <SearchPane {...props} hidden={tab !== 'search'} />
        </div>
        <nav className={styles.tabs}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`${styles.tab} ${tab === id ? styles.active : ''}`}
              onClick={() => onTab(id)}
              aria-label={label}
              aria-pressed={tab === id}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.2 : 1.6} />
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function Outline({ open, chapters, currentChapter, onJump }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) currentRef.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  if (chapters.length === 0) return <p className={styles.empty}>没有识别到章节标题</p>;
  return (
    <ul className={styles.list}>
      {chapters.map((c, i) => (
        <li key={c.offset}>
          <button
            ref={i === currentChapter ? currentRef : undefined}
            className={`${styles.row} ${i === currentChapter ? styles.current : ''}`}
            onClick={() => onJump(c.offset)}
          >
            <span className={styles.rowTitle}>{c.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Marks({ bookmarks, text, onJump, onDeleteBookmark }: Props) {
  if (bookmarks.length === 0) {
    return <p className={styles.empty}>还没有书签。阅读时点击右上角即可添加。</p>;
  }
  return (
    <ul className={styles.list}>
      {bookmarks.map((b) => (
        <li key={b.id} className={styles.markItem}>
          <button className={styles.row} onClick={() => onJump(b.offset)}>
            <span className={styles.rowTitle}>{b.excerpt || '（空白）'}</span>
            <span className={styles.rowMeta}>
              {percentLabel(progressPercent(b.offset, text.length))} · {new Date(b.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </button>
          <button className={styles.iconBtn} onClick={() => onDeleteBookmark(b.id)} aria-label="删除书签">
            <Trash2 size={17} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchPane({ text, onJump, hidden, open, tab }: Props & { hidden: boolean }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (open && tab === 'search') inputRef.current?.focus();
  }, [open, tab]);

  // Folding a multi-MB book takes a few ms, so only do it once the user searches.
  const folded = useMemo(() => (debounced.trim() ? foldAscii(text) : ''), [text, debounced]);
  const result = useMemo(() => searchText(text, folded, debounced), [text, folded, debounced]);

  return (
    <div hidden={hidden} className={styles.search}>
      <input
        ref={inputRef}
        className={styles.searchInput}
        type="search"
        placeholder="搜索全书"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        aria-label="搜索全书"
      />
      {debounced.trim() && (
        <p className={styles.count}>
          {result.hits.length === 0 ? '没有找到' : `${result.hits.length}${result.truncated ? '+' : ''} 处结果`}
        </p>
      )}
      <ul className={styles.list}>
        {result.hits.map((h) => (
          <li key={h.offset}>
            <button className={styles.row} onClick={() => onJump(h.offset)}>
              <span className={styles.hit}>
                {h.before}
                <mark>{h.match}</mark>
                {h.after}
              </span>
              <span className={styles.rowMeta}>{percentLabel(progressPercent(h.offset, text.length))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
