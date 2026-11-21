import { paragraphIndexAt, type Paragraph } from '../books/paragraphs';
import type { Section } from '../books/sections';

/**
 * Layout-aware pagination using CSS multi-column layout.
 *
 * The section's paragraphs are rendered (by any UI layer) as direct children
 * of `columns`, an element styled as
 *   width: W; height: H; column-width: W; column-gap: G; column-fill: auto;
 * so the browser flows the text into W×H columns laid out to the right.
 * Page n is shown by translating the element by -n·(W+G).
 *
 * Because the browser does the line breaking, pages never cut a line in half and
 * never drop or duplicate text. This class only *measures* that layout and maps
 * between stable text offsets and page numbers. It has no React dependency.
 */
export class ColumnPaginator {
  readonly pageCount: number;

  constructor(
    private readonly columns: HTMLElement,
    private readonly paragraphs: readonly Paragraph[],
    private readonly section: Section,
    /** Column width + column gap, in px. */
    private readonly pageStride: number,
  ) {
    const last = section.to - 1;
    const lastP = paragraphs[last]!;
    this.pageCount = Math.max(1, this.rawPageOf(lastP.end - 1) + 1);
  }

  /** Page that displays the character at `offset` (clamped into this section). */
  pageOf(offset: number): number {
    return Math.min(this.pageCount - 1, Math.max(0, this.rawPageOf(offset)));
  }

  /** Offset of the first character shown on `page`. */
  offsetOfPage(page: number): number {
    const { from, to } = this.section;
    if (page <= 0) return this.paragraphs[from]!.start;
    // First paragraph that *starts* on or after `page`.
    let lo = from;
    let hi = to - 1;
    let k = to;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.rawPageOf(this.paragraphs[mid]!.start) >= page) {
        k = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    // The page may begin in the middle of the previous paragraph.
    const prev = this.paragraphs[k - 1];
    if (prev && this.rawPageOf(prev.end - 1) >= page) {
      let a = prev.start;
      let b = prev.end - 1;
      while (a < b) {
        const mid = (a + b) >> 1;
        if (this.rawPageOf(mid) >= page) b = mid;
        else a = mid + 1;
      }
      return a;
    }
    return k < to ? this.paragraphs[k]!.start : this.paragraphs[to - 1]!.start;
  }

  private rawPageOf(offset: number): number {
    const { from, to } = this.section;
    const pi = Math.min(to - 1, Math.max(from, paragraphIndexAt(this.paragraphs, offset)));
    const el = this.columns.children[pi - from];
    const node = el?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return 0;
    const text = node as Text;
    const p = this.paragraphs[pi]!;
    const i = Math.min(Math.max(0, offset - p.start), Math.max(0, text.length - 1));
    const range = document.createRange();
    range.setStart(text, i);
    range.setEnd(text, Math.min(text.length, i + 1));
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    const origin = this.columns.getBoundingClientRect().left;
    const x = r.left + r.width / 2 - origin;
    return Math.floor(x / this.pageStride);
  }
}
