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

  return (
    <>
      {route.name === 'reader' ? <Reader key={route.bookId} bookId={route.bookId} /> : <Bookshelf />}
      <DialogHost />
      <ToastHost />
    </>
  );
}
