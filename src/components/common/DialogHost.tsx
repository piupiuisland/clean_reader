import { useEffect, useRef, useState } from 'react';
import { useDialog } from '../../app/dialogStore';
import styles from './Dialog.module.css';

export function DialogHost() {
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!current) return;
    setText(current.input?.initial ?? '');
    if (current.input) setTimeout(() => inputRef.current?.select(), 50);
  }, [current]);

  if (!current) return null;
  const sheet = current.variant === 'sheet';
  const cancel = current.actions.find((a) => a.style === 'cancel');
  const main = current.actions.filter((a) => a !== cancel);
  const submit = main.find((a) => a.style === 'primary') ?? main[0];

  return (
    <div className={styles.scrim} onClick={() => close({ action: null, text })}>
      <div
        className={sheet ? styles.sheet : styles.alert}
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.group}>
          <div className={styles.head}>
            <div className={styles.title}>{current.title}</div>
            {current.message && <div className={styles.message}>{current.message}</div>}
            {current.input && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (submit) close({ action: submit.value, text });
                }}
              >
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={text}
                  placeholder={current.input.placeholder}
                  onChange={(e) => setText(e.target.value)}
                  enterKeyHint="done"
                />
              </form>
            )}
          </div>
          {main.map((a) => (
            <button
              key={a.value}
              className={`${styles.action} ${a.style === 'danger' ? styles.danger : ''} ${a.style === 'primary' ? styles.primary : ''}`}
              onClick={() => close({ action: a.value, text })}
            >
              {a.label}
            </button>
          ))}
          {!sheet && cancel && (
            <button className={styles.action} onClick={() => close({ action: cancel.value, text })}>
              {cancel.label}
            </button>
          )}
        </div>
        {sheet && cancel && (
          <button className={`${styles.group} ${styles.action} ${styles.cancel}`} onClick={() => close({ action: cancel.value, text })}>
            {cancel.label}
          </button>
        )}
      </div>
    </div>
  );
}
