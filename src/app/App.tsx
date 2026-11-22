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

  // Match the browser/status-bar tint to the current screen's background.
  useEffect(() => {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(route.name === 'reader' ? '--reader-bg' : '--bg')
      .trim();
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
