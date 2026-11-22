import { useEffect } from 'react';
import { Bookshelf } from '../components/Bookshelf/Bookshelf';
import { DialogHost } from '../components/common/DialogHost';
import { ToastHost } from '../components/common/ToastHost';
import { Reader } from '../components/Reader/Reader';
import { useHashRoute } from '../hooks/useHashRoute';
import { requestPersistentStorage } from '../services/storage/db';

export function App() {
  const route = useHashRoute();

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  // Match the browser/status-bar tint to the shelf background (the reader sets its own per theme).
  useEffect(() => {
    if (route.name === 'reader') return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [route.name]);

  return (
    <>
      {route.name === 'reader' ? <Reader key={route.bookId} bookId={route.bookId} /> : <Bookshelf />}
      <DialogHost />
      <ToastHost />
    </>
  );
}
