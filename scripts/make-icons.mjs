// Renders public/icons/book.svg into the PNG app icons with Playwright WebKit.
// Usage: npm run icons
import { webkit } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/icons/book.svg', 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** size: output px; glyph: share of the width taken by the book glyph. */
const targets = [
  { file: 'apple-touch-icon.png', size: 180, glyph: 0.66 },
  { file: 'icon-192.png', size: 192, glyph: 0.66 },
  { file: 'icon-512.png', size: 512, glyph: 0.66 },
  // Maskable icons may be cropped to a circle: keep the glyph inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, glyph: 0.56 },
];

const browser = await webkit.launch();
const page = await browser.newPage();
for (const { file, size, glyph } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;background:#fff;
    display:grid;place-items:center"><img src="${dataUrl}" style="width:${size * glyph}px"></body></html>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: `public/icons/${file}` });
  console.log('wrote', file);
}
await browser.close();

// Favicon: the glyph on a transparent square canvas.
writeFileSync(
  'public/icons/favicon.svg',
  svg.replace('viewBox="0 0 158 124"', 'viewBox="0 -17 158 158"').replace(/\s*<!--.*?-->/, ''),
);
console.log('wrote favicon.svg');
