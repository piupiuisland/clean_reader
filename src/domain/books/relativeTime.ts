const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

export function relativeTime(ts: number, now = Date.now()): string {
  const sec = Math.round((ts - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return '刚刚';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), 'day');
  return new Date(ts).toLocaleDateString('zh-CN');
}
