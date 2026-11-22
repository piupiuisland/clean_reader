import { coverFor } from '../../domain/books/cover';
import styles from './Bookshelf.module.css';

export function Cover({ title }: { title: string }) {
  const c = coverFor(title);
  return (
    <div className={styles.cover} style={{ background: c.background, color: c.color }} aria-hidden="true">
      <div className={styles.coverSpine} style={{ background: c.accent }} />
      <div className={styles.coverTitle}>{Array.from(title)[0]}</div>
    </div>
  );
}
