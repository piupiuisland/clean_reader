import { hashText } from './text';

/** Muted, paper-like palettes for generated covers: [background, accent, text]. */
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#5B6C5D', '#8FA58F', '#F4F1EA'],
  ['#7A5C4F', '#B08A75', '#F7EFE6'],
  ['#4E5D73', '#8597B0', '#EEF1F6'],
  ['#8A6E45', '#C4A574', '#FBF4E6'],
  ['#6B4F63', '#A58399', '#F6EEF3'],
  ['#3F6463', '#7BA3A1', '#EAF3F2'],
  ['#7C6A58', '#B9A48C', '#F5F0E8'],
  ['#5A5A66', '#9696A6', '#F1F1F4'],
];

export interface CoverStyle {
  background: string;
  accent: string;
  color: string;
}

export function coverFor(title: string): CoverStyle {
  const h = parseInt(hashText(title).slice(0, 6), 16);
  const [background, accent, color] = PALETTES[h % PALETTES.length]!;
  return { background, accent, color };
}
