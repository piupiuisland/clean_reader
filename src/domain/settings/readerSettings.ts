export interface ReaderTheme {
  id: string;
  label: string;
  bg: string;
  fg: string;
  dark: boolean;
}

export const READER_THEMES: readonly ReaderTheme[] = [
  { id: 'soft-dark', label: '柔和夜间黑', bg: '#1D2023', fg: '#C8CDD0', dark: true },
  { id: 'dark-coffee', label: '深咖夜读', bg: '#29251F', fg: '#D9CBB8', dark: true },
  { id: 'dark', label: '夜间', bg: '#191919', fg: '#C9C5BD', dark: true },
  { id: 'cream', label: '奶油纸', bg: '#F7F1E5', fg: '#40382F', dark: false },
  { id: 'parchment', label: '经典羊皮纸', bg: '#EDE0C8', fg: '#4A3828', dark: false },
  { id: 'warm-gray', label: '暖灰纸', bg: '#E8E5DE', fg: '#3C3A36', dark: false },
  { id: 'light-green', label: '浅豆绿', bg: '#E3EDDF', fg: '#34483C', dark: false },
  { id: 'matcha', label: '抹茶灰绿', bg: '#D8E0D2', fg: '#354337', dark: false },
  { id: 'green', label: '护眼', bg: '#CFE0CB', fg: '#26331F', dark: false },
];

export interface ReaderFont {
  id: string;
  label: string;
  family: string;
  /**
   * Web font stylesheet (split by unicode-range, so only the glyphs a page
   * uses are downloaded). Only used when the device has no local copy:
   * the system names come first in `family`.
   */
  css?: string;
}

export const READER_FONTS: readonly ReaderFont[] = [
  {
    id: 'pingfang',
    label: '苹方',
    family: "-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'song',
    label: '宋体',
    family: "'Songti SC', 'STSong', 'Noto Serif SC', 'Noto Serif CJK SC', SimSun, serif",
    css: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.3.1/400.css',
  },
  {
    id: 'kai',
    label: '楷体',
    family: "'Kaiti SC', 'STKaiti', 'LXGW WenKai Screen R', KaiTi, serif",
    css: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaigbscreenr.css',
  },
];

export interface ReaderSettings {
  /** Body text size in CSS px. */
  fontSize: number;
  theme: string;
  font: string;
}

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 30;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
  theme: 'soft-dark',
  font: 'song',
};

export const readerTheme = (id: string): ReaderTheme =>
  READER_THEMES.find((t) => t.id === id) ?? READER_THEMES[0]!;

export const readerFont = (id: string): ReaderFont =>
  READER_FONTS.find((f) => f.id === id) ?? READER_FONTS[1]!;

/** Accepts anything read from storage and returns valid settings. */
export function sanitizeReaderSettings(raw: unknown): ReaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReaderSettings, unknown>>;
  const fs = Number(r.fontSize);
  return {
    fontSize: Number.isFinite(fs)
      ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(fs)))
      : DEFAULT_READER_SETTINGS.fontSize,
    theme: READER_THEMES.some((t) => t.id === r.theme) ? (r.theme as string) : DEFAULT_READER_SETTINGS.theme,
    font: READER_FONTS.some((f) => f.id === r.font) ? (r.font as string) : DEFAULT_READER_SETTINGS.font,
  };
}

const loadedCss = new Set<string>();

/** Adds the font's web stylesheet once; the browser fetches glyph files only if needed. */
export function ensureFontCss(font: ReaderFont): void {
  if (!font.css || loadedCss.has(font.css) || typeof document === 'undefined') return;
  loadedCss.add(font.css);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = font.css;
  document.head.appendChild(link);
}
