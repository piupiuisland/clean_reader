import { ALargeSmall, Check, Palette, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettings } from '../../app/settingsStore';
import { ensureFontCss, FONT_SIZE_MAX, FONT_SIZE_MIN, READER_FONTS, READER_THEMES } from '../../domain/settings/readerSettings';
import styles from './SettingsSheet.module.css';

type Item = 'size' | 'theme' | 'font';

const ITEMS = [
  { id: 'size', label: '字号', Icon: ALargeSmall },
  { id: 'theme', label: '主题', Icon: Palette },
  { id: 'font', label: '字体', Icon: Type },
] as const;

/** Reading settings shown from the top-bar menu. Changes apply live. */
export function SettingsSheet() {
  const [item, setItem] = useState<Item>('size');

  return (
    <section className={styles.sheet} aria-label="阅读设置" onClick={(e) => e.stopPropagation()}>
      <div className={styles.menu} role="group" aria-label="设置项">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`${styles.item} ${item === id ? styles.on : ''}`}
            onClick={() => setItem(id)}
            aria-pressed={item === id}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {item === 'size' ? <FontSize /> : item === 'theme' ? <Themes /> : <Fonts />}
    </section>
  );
}

function FontSize() {
  const fontSize = useSettings((s) => s.reader.fontSize);
  const update = useSettings((s) => s.updateReader);
  return (
    <div className={styles.row}>
      <button
        className={styles.step}
        onClick={() => update({ fontSize: fontSize - 1 })}
        disabled={fontSize <= FONT_SIZE_MIN}
        aria-label="字号减小"
      >
        <span style={{ fontSize: 13 }}>A</span>
      </button>
      <input
        className={styles.slider}
        type="range"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={1}
        value={fontSize}
        onChange={(e) => update({ fontSize: Number(e.target.value) })}
        aria-label="字号"
      />
      <button
        className={styles.step}
        onClick={() => update({ fontSize: fontSize + 1 })}
        disabled={fontSize >= FONT_SIZE_MAX}
        aria-label="字号增大"
      >
        <span style={{ fontSize: 20 }}>A</span>
      </button>
      <span className={styles.value} aria-live="polite">
        {fontSize}
      </span>
    </div>
  );
}

function Themes() {
  const theme = useSettings((s) => s.reader.theme);
  const update = useSettings((s) => s.updateReader);
  return (
    <div className={styles.themes} role="radiogroup" aria-label="主题">
      {READER_THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          className={styles.theme}
          onClick={() => update({ theme: t.id })}
        >
          <span className={styles.swatch} style={{ background: t.bg, color: t.fg }}>
            {theme === t.id ? <Check size={18} /> : '文'}
          </span>
          <span className={styles.themeLabel}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function Fonts() {
  const current = useSettings((s) => s.reader.font);
  const update = useSettings((s) => s.updateReader);
  // Fetch the preview glyphs so each button shows its own typeface.
  useEffect(() => READER_FONTS.forEach(ensureFontCss), []);
  return (
    <div className={styles.fonts} role="radiogroup" aria-label="字体">
      {READER_FONTS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={current === f.id}
          className={styles.font}
          style={{ fontFamily: f.family }}
          onClick={() => update({ font: f.id })}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
