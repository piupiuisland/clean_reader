/** Reading progress is always a character offset into the normalized text. */
export function progressPercent(offset: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(100, Math.max(0, (offset / length) * 100));
}

export function formatPercent(offset: number, length: number): string {
  const p = progressPercent(offset, length);
  if (p === 0) return '未读';
  if (p >= 99.95) return '已读完';
  return percentLabel(p);
}

/** The one percent format used everywhere (progress bar, footer, shelf): whole numbers. */
export function percentLabel(percent: number): string {
  return `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
}

export function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(0, Math.floor(offset)), Math.max(0, length - 1));
}
