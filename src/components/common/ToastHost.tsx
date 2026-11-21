import { useToast } from '../../app/dialogStore';
import styles from './Toast.module.css';

export function ToastHost() {
  const { message, tone } = useToast();
  if (!message) return null;
  return (
    <div className={`${styles.toast} ${tone === 'error' ? styles.error : ''}`} role="status">
      {message}
    </div>
  );
}
