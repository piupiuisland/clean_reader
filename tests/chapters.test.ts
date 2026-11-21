import { describe, expect, it } from 'vitest';
import { chapterIndexAt, detectChapters, isChapterHeading } from '../src/domain/books/chapters';
import { splitParagraphs } from '../src/domain/books/paragraphs';
import { excerptAt, foldAscii, searchText } from '../src/domain/books/search';

describe('chapter detection', () => {
  it('recognizes common Chinese and English headings', () => {
    for (const h of ['第一章 风起', '第 12 章', '第一百二十三回　大闹天宫', '第三卷 归来', '序章', '楔子', '尾声', '番外一 春日', 'Chapter 1', 'CHAPTER XII. The End', 'Prologue']) {
      expect(isChapterHeading(h), h).toBe(true);
    }
  });

  it('ignores prose that merely mentions chapters', () => {
    for (const l of ['他翻到第一章，开始阅读这本很厚很厚的书，一直读到了深夜才停下来休息，第二天又继续读。', '序列号是多少？', 'Chapters are hard', '第一次见面']) {
      expect(isChapterHeading(l), l).toBe(false);
    }
  });

  it('finds chapters with offsets and locates the current one', () => {
    const text = '书名\n\n第一章 开始\n　　正文。\n第二章 继续\n　　更多正文。';
    const ch = detectChapters(text, splitParagraphs(text));
    expect(ch.map((c) => c.title)).toEqual(['第一章 开始', '第二章 继续']);
    expect(text.slice(ch[1]!.offset, ch[1]!.offset + 3)).toBe('第二章');
    expect(chapterIndexAt(ch, 0)).toBe(-1);
    expect(chapterIndexAt(ch, ch[0]!.offset + 3)).toBe(0);
    expect(chapterIndexAt(ch, text.length)).toBe(1);
  });
});

describe('search', () => {
  const text = '他说：Hello World。\n她说：hello again。HELLO!';
  it('is case-insensitive for latin text and keeps exact offsets', () => {
    const { hits } = searchText(text, foldAscii(text), 'hello');
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(text.slice(h.offset, h.offset + 5).toLowerCase()).toBe('hello');
    expect(hits[0]!.before).toBe('他说：');
  });

  it('finds Chinese text and reports truncation', () => {
    const t = '说'.repeat(10);
    const r = searchText(t, t, '说', 3);
    expect(r.hits.map((h) => h.offset)).toEqual([0, 1, 2]);
    expect(r.truncated).toBe(true);
    expect(searchText(t, t, '   ').hits).toEqual([]);
  });

  it('excerptAt skips leading whitespace', () => {
    expect(excerptAt('\n　　正文内容\n下一段', 0, 10)).toBe('正文内容 下一段');
  });
});
