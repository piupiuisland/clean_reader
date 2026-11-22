import { describe, expect, it } from 'vitest';
import { paragraphIndexAt, splitParagraphs } from '../src/domain/books/paragraphs';
import { buildSections, sectionIndexForParagraph } from '../src/domain/books/sections';
import { hashText, normalizeText, titleFromFileName } from '../src/domain/books/text';

describe('normalizeText', () => {
  it('normalizes CRLF / CR and strips BOM', () => {
    expect(normalizeText('﻿a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });
});

describe('titleFromFileName', () => {
  it('strips extension and book-title marks', () => {
    expect(titleFromFileName('《三体》作者：刘慈欣.txt')).toBe('三体');
    expect(titleFromFileName('Pride and Prejudice.TXT')).toBe('Pride and Prejudice');
  });
});

describe('splitParagraphs', () => {
  it('keeps offsets into the original text and trims full-width indents', () => {
    const text = '第一章\n\n　　他说：“走吧。”\n   \n　　她笑了。';
    const ps = splitParagraphs(text);
    expect(ps.map((p) => text.slice(p.start, p.end))).toEqual(['第一章', '他说：“走吧。”', '她笑了。']);
    expect(ps.every((p) => !p.continuation)).toBe(true);
  });

  it('splits very long lines at sentence punctuation without losing text', () => {
    const sentence = '这是一句很长的测试文本，用来检查分段逻辑。';
    const text = sentence.repeat(300); // one 6300-char line, no newlines
    const ps = splitParagraphs(text, 1000);
    expect(ps.length).toBeGreaterThan(5);
    expect(ps.map((p) => text.slice(p.start, p.end)).join('')).toBe(text);
    for (const p of ps) {
      expect(p.end - p.start).toBeLessThanOrEqual(1000);
      if (p.end !== text.length) expect(text[p.end - 1]).toBe('。');
    }
    expect(ps[0]!.continuation).toBe(false);
    expect(ps.slice(1).every((p) => p.continuation)).toBe(true);
  });

  it('hard-cuts text without punctuation and never splits surrogate pairs', () => {
    const text = '𠀀'.repeat(800); // astral chars = 2 code units each
    const ps = splitParagraphs(text, 1001);
    expect(ps.map((p) => text.slice(p.start, p.end)).join('')).toBe(text);
    for (const p of ps) expect((p.end - p.start) % 2).toBe(0);
  });

  it('paragraphIndexAt finds the containing or preceding paragraph', () => {
    const text = 'aaa\nbbb\n\nccc';
    const ps = splitParagraphs(text);
    expect(paragraphIndexAt(ps, 0)).toBe(0);
    expect(paragraphIndexAt(ps, 3)).toBe(0); // the newline belongs to the previous paragraph
    expect(paragraphIndexAt(ps, 5)).toBe(1);
    expect(paragraphIndexAt(ps, 9)).toBe(2);
    expect(paragraphIndexAt(ps, 999)).toBe(2);
  });
});

describe('buildSections', () => {
  it('covers every paragraph exactly once, in order', () => {
    const text = Array.from({ length: 500 }, (_, i) => `第${i}段。`.repeat(10)).join('\n');
    const ps = splitParagraphs(text);
    const ss = buildSections(ps, 2000);
    expect(ss[0]!.from).toBe(0);
    expect(ss[ss.length - 1]!.to).toBe(ps.length);
    for (let i = 1; i < ss.length; i++) expect(ss[i]!.from).toBe(ss[i - 1]!.to);
    for (let i = 0; i < ps.length; i += 37) {
      const s = ss[sectionIndexForParagraph(ss, i)]!;
      expect(i >= s.from && i < s.to).toBe(true);
    }
  });
});

describe('hashText', () => {
  it('is deterministic and content sensitive', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });
});

import { formatFileSize } from '../src/domain/books/fileSize';
describe('formatFileSize', () => {
  it('formats B / KB / MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(3.4 * 1048576)).toBe('3.4 MB');
    expect(formatFileSize(25 * 1048576)).toBe('25 MB');
  });
});
