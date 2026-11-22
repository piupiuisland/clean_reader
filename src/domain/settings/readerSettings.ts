export interface ReaderSettings {
  /** Body text size in CSS px. */
  fontSize: number;
}

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 30;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
};

/** Accepts anything read from storage and returns valid settings. */
export function sanitizeReaderSettings(raw: unknown): ReaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ReaderSettings>;
  const fs = Number(r.fontSize);
  return {
    fontSize: Number.isFinite(fs)
      ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(fs)))
      : DEFAULT_READER_SETTINGS.fontSize,
  };
}
