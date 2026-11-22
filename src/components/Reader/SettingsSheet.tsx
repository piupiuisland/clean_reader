import { ALargeSmall } from 'lucide-react';
import { useSettings } from '../../app/settingsStore';
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../../domain/settings/readerSettings';
import styles from './SettingsSheet.module.css';

/** Reading settings shown from the top-bar menu. Changes apply live. */
export function SettingsSheet() {
  const fontSize = useSettings((s) => s.reader.fontSize);
  const update = useSettings((s) => s.updateReader);

  return (
    <section className={styles.sheet} aria-label="阅读设置" onClick={(e) => e.stopPropagation()}>
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden="true">
          <ALargeSmall size={22} />
        </span>
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
    </section>
  );
}
