import { useEffect, useState } from 'react';

export type Route = { name: 'shelf' } | { name: 'reader'; bookId: string };

export function parseHash(hash: string): Route {
  const m = hash.match(/^#\/book\/([^/?#]+)/);
  return m ? { name: 'reader', bookId: decodeURIComponent(m[1]!) } : { name: 'shelf' };
}

export function navigate(route: Route) {
  window.location.hash = route.name === 'reader' ? `#/book/${encodeURIComponent(route.bookId)}` : '#/';
}

/** Hash routing works on GitHub Pages without server rewrites. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
