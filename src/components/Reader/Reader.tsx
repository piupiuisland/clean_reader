import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, House, Menu, TableOfContents } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../../app/dialogStore';
import { useSettings } from '../../app/settingsStore';
import { chapterIndexAt, detectChapters, type Chapter } from '../../domain/books/chapters';
import { excerptAt } from '../../domain/books/search';
import { splitParagraphs, paragraphIndexAt, type Paragraph } from '../../domain/books/paragraphs';
import { buildSections, sectionIndexForParagraph, type Section } from '../../domain/books/sections';
import { ColumnPaginator } from '../../domain/pagination/columnPaginator';
import { clampOffset, percentLabel, progressPercent } from '../../domain/progress/progress';
import { navigate } from '../../hooks/useHashRoute';
import { bookRepository } from '../../services/storage/bookRepository';
import type { BookmarkRecord, BookRecord } from '../../services/storage/db';
import styles from './Reader.module.css';
import { SettingsSheet } from './SettingsSheet';
import { ensureFontCss, readerFont, readerTheme } from '../../domain/settings/readerSettings';
import { SidePanel, type PanelTab } from './SidePanel';

interface LoadedBook {
  book: BookRecord;
  text: string;
  paragraphs: Paragraph[];
  sections: Section[];
  chapters: Chapter[];
  bookmarks: BookmarkRecord[];
  initialOffset: number;
}

export function Reader({ bookId }: { bookId: string }) {
  const [data, setData] = useState<LoadedBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const book = await bookRepository.get(bookId);
        const text = book ? await bookRepository.getText(bookId) : undefined;
        if (!book || text === undefined) throw new Error('找不到这本书，它可能已被删除。');
        const initialOffset = clampOffset(await bookRepository.getProgress(bookId), text.length);
        const paragraphs = splitParagraphs(text);
        const sections = buildSections(paragraphs);
        const chapters = detectChapters(text, paragraphs);
        const bookmarks = await bookRepository.listBookmarks(bookId);
        await useSettings.getState().load(); // typography must be known before the first layout
        void bookRepository.markOpened(bookId);
        if (!cancelled) setData({ book, text, paragraphs, sections, chapters, bookmarks, initialOffset });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (error) {
    return (
      <div className={styles.status}>
        <p>{error}</p>
        <button className={styles.statusButton} onClick={() => navigate({ name: 'shelf' })}>
          返回书架
        </button>
      </div>
    );
  }
  if (!data) return <div className={styles.status} />;
  return <ReaderView {...data} />;
}

/** Where to land after a section is (re)laid out. */
type Target = { kind: 'offset'; offset: number } | { kind: 'start' } | { kind: 'end' };

interface Geometry {
  width: number;
  height: number;
  gap: number;
}

const COLUMN_GAP = 48;
const SAVE_DEBOUNCE_MS = 600;
const SWIPE_MIN_PX = 40;
/** Left/right share of the screen that turns pages; the middle opens the menu. */
const SIDE_ZONE = 0.3;
/** A swipe must start this close to the right edge to open the side panel. */
const EDGE_PX = 28;
/** Top-right corner tap zone that toggles a bookmark while reading. */
const CORNER_PX = 72;
/** Slider resolution: 0.1% steps. */
const SLIDER_MAX = 1000;

function ReaderView({ book, text, paragraphs, sections, chapters, bookmarks: initialBookmarks, initialOffset }: LoadedBook) {
  const frameRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const paginatorRef = useRef<ColumnPaginator | null>(null);

  const sectionOf = useCallback(
    (offset: number) => sectionIndexForParagraph(sections, paragraphIndexAt(paragraphs, offset)),
    [sections, paragraphs],
  );

  // `pos` says which section to render and where to land in it. A new object
  // always triggers a re-layout, even for the same section.
  const [pos, setPos] = useState<{ section: number; target: Target }>(() => ({
    section: sectionOf(initialOffset),
    target: { kind: 'offset', offset: initialOffset },
  }));
  const [geom, setGeom] = useState<Geometry | null>(null);
  const geomRef = useRef<Geometry | null>(null);
  const [page, setPage] = useState({ index: 0, count: 1 });
  const section = sections[pos.section]!;

  /**
   * The reading anchor: a stable text offset that only changes when the *reader*
   * navigates. Re-layouts (resize, rotation, font load) map the anchor to a page
   * but never move the anchor, so the position does not drift.
   */
  const anchorRef = useRef(initialOffset);
  const [anchor, setAnchorState] = useState(initialOffset);
  const savedRef = useRef(initialOffset);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [chrome, setChrome] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fontSize = useSettings((st) => st.reader.fontSize);
  const theme = readerTheme(useSettings((st) => st.reader.theme));
  const font = readerFont(useSettings((st) => st.reader.font));
  useEffect(() => ensureFontCss(font), [font]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tint the status-bar area to the page colour of the chosen theme.
  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const color = getComputedStyle(rootRef.current).getPropertyValue('--reader-bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [theme.id]);
  const [panel, setPanel] = useState<{ open: boolean; tab: PanelTab }>({ open: false, tab: 'outline' });
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  /** [start, end) text range shown on the current page. */
  const [pageRange, setPageRange] = useState({ start: initialOffset, end: initialOffset + 1 });

  // ---- persistence -------------------------------------------------------

  const save = useCallback(() => {
    const o = anchorRef.current;
    if (o === savedRef.current) return;
    savedRef.current = o;
    bookRepository.saveProgress(book.id, o).catch(() => {
      savedRef.current = -1; // retry on next save
    });
  }, [book.id]);

  const setAnchor = useCallback(
    (o: number) => {
      anchorRef.current = o;
      setAnchorState(o);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  useEffect(() => {
    // iOS may kill a backgrounded PWA without notice, so save right away.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      clearTimeout(saveTimer.current);
      save();
    };
  }, [save]);

  // ---- geometry ----------------------------------------------------------

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const r = frame.getBoundingClientRect();
      const g = { width: Math.floor(r.width), height: Math.floor(r.height), gap: COLUMN_GAP };
      const old = geomRef.current;
      if (old && old.width === g.width && old.height === g.height) return;
      geomRef.current = g;
      setGeom(g);
      // Re-layout around the anchor (not the page number) in the current section.
      if (old) setPos((p) => ({ section: p.section, target: { kind: 'offset', offset: anchorRef.current } }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    // Web fonts or late system-font fallback can change line breaks.
    const relayout = () =>
      setPos((p) => ({ section: p.section, target: { kind: 'offset', offset: anchorRef.current } }));
    void document.fonts?.ready.then(relayout);
    // Web-font glyph files arrive after the first layout (e.g. 宋体/楷体 on iPhone).
    document.fonts?.addEventListener?.('loadingdone', relayout);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', relayout);
    };
  }, []);

  // Typography changed: re-paginate around the anchor so the reading position is kept.
  const firstFont = useRef(true);
  useLayoutEffect(() => {
    if (firstFont.current) {
      firstFont.current = false;
      return;
    }
    setPos((p) => ({ section: p.section, target: { kind: 'offset', offset: anchorRef.current } }));
  }, [fontSize, font.id]);

  // ---- layout: runs after the section is in the DOM with the new geometry --

  useLayoutEffect(() => {
    const columns = columnsRef.current;
    if (!geom || !columns) return;
    const pg = new ColumnPaginator(columns, paragraphs, section, geom.width + geom.gap);
    paginatorRef.current = pg;
    const t = pos.target;
    let index: number;
    if (t.kind === 'offset') {
      index = pg.pageOf(t.offset);
      if (t.offset !== anchorRef.current) setAnchor(t.offset);
    } else {
      index = t.kind === 'start' ? 0 : pg.pageCount - 1;
      setAnchor(pg.offsetOfPage(index));
    }
    setPage({ index, count: pg.pageCount });
  }, [pos, geom, paragraphs, section, setAnchor]);

  useLayoutEffect(() => {
    const pg = paginatorRef.current;
    if (!pg) return;
    const start = pg.offsetOfPage(page.index);
    const end =
      page.index + 1 < pg.pageCount ? pg.offsetOfPage(page.index + 1) : (sections[pos.section + 1]?.start ?? text.length);
    setPageRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [page, pos, geom, sections, text.length]);

  // ---- navigation --------------------------------------------------------

  const showPage = useCallback(
    (index: number) => {
      const pg = paginatorRef.current;
      if (!pg) return;
      setPage((p) => ({ ...p, index }));
      setAnchor(pg.offsetOfPage(index));
    },
    [setAnchor],
  );

  const next = useCallback(() => {
    if (page.index < page.count - 1) showPage(page.index + 1);
    else if (pos.section < sections.length - 1) setPos({ section: pos.section + 1, target: { kind: 'start' } });
    else toast('已经是最后一页了');
  }, [page, pos.section, sections.length, showPage]);

  const prev = useCallback(() => {
    if (page.index > 0) showPage(page.index - 1);
    else if (pos.section > 0) setPos({ section: pos.section - 1, target: { kind: 'end' } });
    else toast('已经是第一页了');
  }, [page, pos.section, showPage]);

  const jumpTo = useCallback(
    (raw: number) => {
      const o = clampOffset(raw, text.length);
      const si = sectionOf(o);
      const pg = paginatorRef.current;
      if (si === pos.section && pg) {
        setPage((p) => ({ ...p, index: pg.pageOf(o) }));
        setAnchor(o);
      } else {
        setPos({ section: si, target: { kind: 'offset', offset: o } });
      }
    },
    [text.length, sectionOf, pos.section, setAnchor],
  );

  const panelOpenRef = useRef(false);
  panelOpenRef.current = panel.open;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || panelOpenRef.current) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) next();
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) prev();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // ---- touch: tap zones + swipe -----------------------------------------

  const touch = useRef<{ x: number; y: number; swiped: boolean; edge: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]!;
    const h = window.innerHeight;
    // Right edge, roughly the middle of the screen height: opens the side panel.
    const edge = t.clientX > window.innerWidth - EDGE_PX && t.clientY > h * 0.2 && t.clientY < h * 0.8;
    touch.current = { x: t.clientX, y: t.clientY, swiped: false, edge };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      start.swiped = true;
      if (start.edge && dx < 0) openPanel();
      else if (chrome) {
        setChrome(false);
        setSettingsOpen(false);
      }
      else if (dx < 0) next();
      else prev();
    }
  };

  const onTap = (e: React.MouseEvent) => {
    if (touch.current?.swiped) {
      touch.current = null;
      return;
    }
    if (chrome) {
      setChrome(false);
      setSettingsOpen(false);
      return;
    }
    if (e.clientX > window.innerWidth - CORNER_PX && e.clientY < cornerBottom()) {
      toggleBookmark();
      return;
    }
    const x = e.clientX / window.innerWidth;
    if (x < SIDE_ZONE) prev();
    else if (x > 1 - SIDE_ZONE) next();
    else setChrome(true);
  };

  const cornerBottom = () => (frameRef.current?.getBoundingClientRect().top ?? 0) + CORNER_PX / 2;

  // ---- bookmarks + side panel -------------------------------------------

  const pageMarks = bookmarks.filter((b) => b.offset >= pageRange.start && b.offset < pageRange.end);
  const isMarked = pageMarks.length > 0;

  const toggleBookmark = async () => {
    try {
      if (isMarked) {
        await bookRepository.removeBookmarks(pageMarks.map((b) => b.id));
        setBookmarks((bs) => bs.filter((b) => !pageMarks.includes(b)));
        toast('已删除书签');
      } else {
        const rec = await bookRepository.addBookmark(book.id, pageRange.start, excerptAt(text, pageRange.start));
        setBookmarks((bs) => [...bs, rec].sort((a, b) => a.offset - b.offset));
        toast('已添加书签');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const deleteBookmark = async (id: number) => {
    await bookRepository.removeBookmarks([id]);
    setBookmarks((bs) => bs.filter((b) => b.id !== id));
  };

  const openPanel = (tab?: PanelTab) => {
    setChrome(false);
    setSettingsOpen(false);
    setPanel((p) => ({ open: true, tab: tab ?? p.tab }));
  };
  const closePanel = () => setPanel((p) => ({ ...p, open: false }));

  const headingStarts = useMemo(() => new Set(chapters.map((c) => c.offset)), [chapters]);
  const chapterIdx = chapterIndexAt(chapters, anchor);
  const chapterTitle = chapterIdx >= 0 ? chapters[chapterIdx]!.title : book.title;

  // Stop iOS rubber-banding / page scroll while reading (needs a non-passive listener).
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  // ---- progress slider (whole book) --------------------------------------

  // While dragging, the label shows exactly where the thumb is. After release it keeps
  // showing that value (not the page's measured position) until the reader turns a page.
  const scrubRaf = useRef(0);
  const lastDrag = useRef<{ percent: number; offset: number } | null>(null);
  const applyDrag = (v: number) => {
    const percent = (v / SLIDER_MAX) * 100;
    const o = clampOffset(Math.round((percent / 100) * text.length), text.length);
    lastDrag.current = { percent, offset: o };
    jumpTo(o);
  };
  const onScrub = (v: number) => {
    setScrub(v);
    cancelAnimationFrame(scrubRaf.current);
    scrubRaf.current = requestAnimationFrame(() => applyDrag(v)); // at most one re-layout per frame
  };
  const endScrub = () => {
    if (scrub === null) return;
    cancelAnimationFrame(scrubRaf.current);
    applyDrag(scrub); // flush the final position so the label never flickers back
    setScrub(null);
  };

  const shownPercent =
    scrub !== null
      ? (scrub / SLIDER_MAX) * 100
      : lastDrag.current && lastDrag.current.offset === anchor
        ? lastDrag.current.percent
        : progressPercent(anchor, text.length);
  const sliderValue = Math.round((shownPercent / 100) * SLIDER_MAX);

  const columnsStyle: React.CSSProperties | undefined = geom
    ? {
        width: geom.width,
        height: geom.height,
        columnWidth: geom.width,
        columnGap: geom.gap,
        transform: `translateX(${-page.index * (geom.width + geom.gap)}px)`,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={styles.reader}
      data-theme={theme.id}
      style={
        {
          '--reader-size': `${fontSize}px`,
          '--reader-bg': theme.bg,
          '--reader-fg': theme.fg,
          '--reader-font': font.family,
          colorScheme: theme.dark ? 'dark' : 'light',
        } as React.CSSProperties
      }
    >
      <div
        ref={surfaceRef}
        className={styles.surface}
        onClick={onTap}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div ref={frameRef} className={styles.frame}>
          <div ref={columnsRef} className={styles.columns} style={columnsStyle}>
            <SectionText text={text} paragraphs={paragraphs} section={section} headings={headingStarts} />
          </div>
        </div>
        {isMarked && <div className={styles.ribbon} aria-label="本页已加书签" />}
        {!chrome && (
          <div className={styles.footer}>
            <span className={styles.footerTitle}>{chapterTitle}</span>
            <span>{percentLabel(shownPercent)}</span>
          </div>
        )}
      </div>

      {chrome && (
        <>
          <header className={styles.topBar}>
            <div className={styles.barSide}>
              <button className={styles.back} onClick={() => navigate({ name: 'shelf' })} aria-label="返回书架">
                <House size={22} />
              </button>
              <button
                className={`${styles.back} ${settingsOpen ? styles.active : ''}`}
                onClick={() => setSettingsOpen((o) => !o)}
                aria-label="菜单"
                aria-expanded={settingsOpen}
              >
                <Menu size={22} />
              </button>
            </div>
            <div className={styles.barTitle}>{book.title}</div>
            <div className={`${styles.barSide} ${styles.barRight}`}>
            <button
              className={`${styles.back} ${isMarked ? styles.marked : ''}`}
              onClick={toggleBookmark}
              aria-label={isMarked ? '删除书签' : '添加书签'}
            >
              {isMarked ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
            </button>
            </div>
          </header>
          {settingsOpen ? (
            <SettingsSheet />
          ) : (
          <footer className={styles.bottomBar}>
            <button className={styles.step} onClick={() => openPanel()} aria-label="目录与书签">
              <TableOfContents size={21} />
            </button>
            <button className={styles.step} onClick={prev} aria-label="上一页">
              <ChevronLeft size={22} />
            </button>
            <input
              className={styles.slider}
              type="range"
              min={0}
              max={SLIDER_MAX}
              step={1}
              value={sliderValue}
              onChange={(e) => onScrub(Number(e.target.value))}
              onPointerUp={endScrub}
              onTouchEnd={endScrub}
              onBlur={endScrub}
              aria-label="阅读进度"
            />
            <button className={styles.step} onClick={next} aria-label="下一页">
              <ChevronRight size={22} />
            </button>
            <div className={styles.percent} aria-live="polite">
              {percentLabel(shownPercent)}
            </div>
          </footer>
          )}
        </>
      )}

      <SidePanel
        open={panel.open}
        tab={panel.tab}
        onTab={(tab) => setPanel((p) => ({ ...p, tab }))}
        onClose={closePanel}
        onJump={(o) => {
          jumpTo(o);
          closePanel();
        }}
        text={text}
        chapters={chapters}
        currentChapter={chapterIdx}
        bookmarks={bookmarks}
        onDeleteBookmark={deleteBookmark}
      />
    </div>
  );
}

/** Memoized so page turns and progress updates don't re-render the section's <p> elements. */
const SectionText = memo(function SectionText({
  text,
  paragraphs,
  section,
  headings,
}: {
  text: string;
  paragraphs: Paragraph[];
  section: Section;
  /** Paragraph start offsets that are chapter headings. */
  headings: ReadonlySet<number>;
}) {
  const nodes = useMemo(() => {
    const out = [];
    for (let i = section.from; i < section.to; i++) {
      const p = paragraphs[i]!;
      out.push(
        <p
          key={p.start}
          className={headings.has(p.start) ? styles.heading : p.continuation ? styles.cont : undefined}
        >
          {text.slice(p.start, p.end)}
        </p>,
      );
    }
    return out;
  }, [text, paragraphs, section, headings]);
  return <>{nodes}</>;
});
