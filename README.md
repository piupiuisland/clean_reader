# PureReader Lite

A minimalist, offline-first ebook reader for iPhone, built as a PWA.
No ads, no accounts, no backend: books stay on your device in IndexedDB.

**Status: Milestone 1 + most of Milestone 2** (TXT import, bookshelf, local storage, real
page turning, whole-book progress bar, bookmarks, chapter outline, full-text search, resume). See [the roadmap](#roadmap).

## Reading controls

| Gesture                              | Action                                    |
| ------------------------------------ | ----------------------------------------- |
| Tap left 30% of the screen          | Previous page                             |
| Tap right 30% of the screen         | Next page                                 |
| Tap the middle (e.g. bottom-center) | Show/hide menu with whole-book progress bar |
| Tap the top-right corner            | Add/remove a bookmark on this page (red ribbon) |
| Swipe left / right                  | Next / previous page                      |
| Swipe left from the right edge (mid-height) | Open the side panel: outline · bookmarks · search |
| Drag the progress bar               | Jump anywhere; the page follows live      |
| Menu: 🏠 top-left / 🔖 top-right / ☰ bottom-left | Back to shelf / toggle bookmark / open side panel |
| ← → / Space / PageUp / PageDown      | Page turns on a keyboard                  |

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Dev server on localhost                              |
| `npm run dev:phone`  | Dev server exposed on your LAN (for iPhone testing)  |
| `npm run build`      | Type-check + production build into `dist/`           |
| `npm run preview`    | Serve the production build on your LAN               |
| `npm test`           | Unit tests (Vitest): decoding, paragraphs, storage   |
| `npm run test:e2e`   | End-to-end tests (Playwright, iPhone-emulated WebKit)|

The first time you run e2e tests, you may need `npx playwright install webkit`.

## Test on an iPhone

1. Connect the Mac and iPhone to the same Wi-Fi network.
2. Run `npm run dev:phone`. Vite prints a `Network:` URL such as `http://192.168.1.23:5173`.
3. Open that URL in Safari on the iPhone. If it doesn't load, allow incoming connections
   for Node in macOS **System Settings → Network → Firewall**.
4. Tap **+**, then choose a `.txt` file in the Files app. If the file is in iCloud Drive,
   iOS downloads it first.
5. Read for a while, close the Safari tab (or swipe Safari away), then open the URL again.
   The book should still be on the shelf and reopen at the same place.

Notes:
- Data is stored **per origin**. A book imported via `192.168.1.23:5173` doesn't appear at
  `localhost` or the future GitHub Pages URL. Backup/restore (Milestone 4) covers moving data.
- "Add to Home Screen" works now, but offline mode arrives in Milestone 3 (service worker).

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs the unit tests, builds with `BASE_PATH=/<repo>/`, and
publishes `dist/` on every push to `main`.

1. In the GitHub repo, open **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions** (one-time setup).
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. Open `https://<user>.github.io/<repo>/` in Safari on the iPhone, then
   **Share → Add to Home Screen**.

GitHub Pages serves over HTTPS, so the site behaves the same as it will once offline support
lands in Milestone 3.

## How it works

```
src/
├── app/                 App shell, Zustand stores (shelf, dialogs/toasts)
├── components/
│   ├── Bookshelf/       Grid, generated covers, rename/delete sheet
│   ├── Reader/          Reading screen
│   └── common/          Dialog + toast hosts
├── domain/              Pure logic, no React (unit tested)
│   ├── books/           Text normalization, paragraphs, sections, covers, hashing
│   ├── pagination/      Layout-measured pagination engine (no React)
│   └── progress/        Offset ↔ percent helpers
├── services/
│   ├── import/          TXT validation + encoding detection
│   └── storage/         Dexie schema (versioned) + repository
├── hooks/               Hash routing (works on GitHub Pages without rewrites)
└── styles/              Global CSS variables (themes come in Milestone 2)
```

- **Encodings**: a BOM is used if present (UTF-8/UTF-16), then strict UTF-8 is tried, then
  GB18030 (a superset of GBK/GB2312). This uses the browser's native `TextDecoder`, so it
  needs no extra library. Binary or undecodable files are rejected with a clear message.
- **Stable positions**: text is normalized once at import (`\r\n` → `\n`, BOM removed).
  Progress is stored as a **character offset** into that text, including the position
  within a paragraph, so it stays valid after any change to layout or typography.
- **Pagination**: the browser lays text into real pages with CSS columns (one column = one
  page), so lines are never cut and no text is skipped or repeated. `ColumnPaginator`
  measures that layout to map *offset ↔ page*. Rotating the device or changing the viewport
  re-paginates around the saved offset, not the page number, so the position doesn't drift.
- **Large books**: only one ~16k-character section of whole paragraphs is in the DOM at a
  time. Turning past the last page of a section loads the next one seamlessly. Very long
  lines (common in poorly formatted TXT files) are split at sentence punctuation.
- **Storage**: book metadata, content and progress are separate tables, so the shelf never
  loads full texts. Progress saves 600 ms after a page turn, and immediately when the app
  goes to the background. The app requests persistent storage on startup.
- **Chapters**: headings such as `第一章`, `第12回`, `序章`, `楔子`, `番外` and `Chapter 1` are
  detected from short lines. Each chapter starts on a new page, and the footer shows the
  current chapter.
- **Bookmarks** are stored as text offsets (database schema v2, migrated automatically), so
  they stay correct when the layout changes.
- **Duplicates**: identical content asks whether to import again. The same title with
  different content (for example, an updated serial novel) offers *Replace (keep progress)*
  or *Keep both*.

## Roadmap

- [x] **M1**: TXT import (UTF-8/GBK), bookshelf, IndexedDB, basic reading, resume
- [ ] **M2**: ~~pagination, tap zones and swipe, progress bar, bookmarks~~ ✓ · typography settings, themes
- [ ] **M3**: Service worker/offline, manifest and icons, safe-area polish, GitHub Pages deploy
- [ ] **M4**: Backup/restore, large-file performance, reliability tests
