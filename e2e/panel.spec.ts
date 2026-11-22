import { expect, test, type Page } from '@playwright/test';

const chapter = (n: number) =>
  `第${n}章　风起${n}\n` +
  Array.from({ length: 30 }, (_, i) => `　　这是第${n}章第${i + 1}段。他抬起头，望向远处的山峦，夜色渐深。`).join('\n');
const BOOK = Array.from({ length: 20 }, (_, i) => chapter(i + 1)).join('\n') + '\n　　终于找到了那把金色钥匙。';

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles({ name: '风起.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: '风起', exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
}

const vp = (page: Page) => page.viewportSize()!;
const tapRight = (page: Page) => page.mouse.click(vp(page).width * 0.9, vp(page).height * 0.6);
const tapCenter = (page: Page) => page.mouse.click(vp(page).width / 2, vp(page).height * 0.85);
const tapTopRightCorner = (page: Page) => page.mouse.click(vp(page).width - 20, 40);

/** Simulate a finger swipe with real TouchEvents (React listens for these). */
async function swipe(page: Page, from: [number, number], to: [number, number]) {
  await page.evaluate(
    ([[x0, y0], [x1, y1]]) => {
      const target = document.elementFromPoint(x0, y0)!;
      // WebKit forbids `new Touch()`, so fake the touch lists on a plain event.
      const fire = (type: string, x: number, y: number, active: boolean) => {
        const t = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: active ? [t] : [] });
        Object.defineProperty(ev, 'targetTouches', { value: active ? [t] : [] });
        Object.defineProperty(ev, 'changedTouches', { value: [t] });
        target.dispatchEvent(ev);
      };
      fire('touchstart', x0, y0, true);
      fire('touchmove', (x0 + x1) / 2, (y0 + y1) / 2, true);
      fire('touchend', x1, y1, false);
    },
    [from, to] as const,
  );
}

test('home icon at top-left returns to the shelf', async ({ page }) => {
  await open(page);
  await tapCenter(page);
  await page.getByRole('button', { name: '返回书架' }).click();
  await expect(page.getByRole('heading', { name: '书架' })).toBeVisible();
});

test('tap top-right corner adds a bookmark; it shows in the marks list and jumps back', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 5; i++) await tapRight(page);
  const markedFirst = await page.evaluate(() => document.querySelector('[class*=_footer_]')?.textContent);

  await tapTopRightCorner(page);
  await expect(page.getByText('已添加书签')).toBeVisible();
  await expect(page.getByLabel('本页已加书签')).toBeAttached();

  // Leave the page: ribbon disappears.
  await tapRight(page);
  await expect(page.getByLabel('本页已加书签')).not.toBeAttached();

  // Bookmark icon at top-right of the menu does the same.
  await tapCenter(page);
  await page.getByRole('button', { name: '添加书签' }).click();
  await expect(page.getByRole('button', { name: '删除书签' })).toBeVisible();
  await tapCenter(page); // close menu

  // Open the panel via edge swipe (right edge, middle height, right → left).
  const { width, height } = vp(page);
  await swipe(page, [width - 8, height / 2], [width - 200, height / 2]);
  const panel = page.getByRole('dialog', { name: '书签' });
  await expect(panel).toBeInViewport({ ratio: 1 }); // wait for the slide-in to finish
  const tabBtn = panel.getByRole('button', { name: '书签', exact: true });
  await tabBtn.click();
  const items = panel.locator('li');
  await expect(items).toHaveCount(2);

  // Jump to the first bookmark.
  await items.first().getByRole('button').first().click();
  await expect(panel).not.toBeInViewport();
  await expect(page.getByLabel('本页已加书签')).toBeAttached();
  expect(await page.evaluate(() => document.querySelector('[class*=_footer_]')?.textContent)).toBe(markedFirst);

  // Bookmarks survive a reload; delete one from the list.
  await page.reload();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  await tapCenter(page);
  await page.getByRole('button', { name: '目录与书签' }).click();
  await panel.getByRole('button', { name: '书签', exact: true }).click();
  await expect(panel.locator('li')).toHaveCount(2);
  await panel.getByRole('button', { name: '删除书签' }).first().click();
  await expect(panel.locator('li')).toHaveCount(1);
});

test('swipe left in the middle of the page still turns the page (not the panel)', async ({ page }) => {
  await open(page);
  const { width, height } = vp(page);
  await swipe(page, [width * 0.7, height / 2], [width * 0.2, height / 2]);
  await expect(page.getByRole('dialog', { name: '书签' })).not.toBeInViewport();
  await expect(page.locator('[class*=_footer_]')).not.toContainText('0%');
});

test('outline lists detected chapters and jumps to one', async ({ page }) => {
  await open(page);
  await tapCenter(page);
  await page.getByRole('button', { name: '目录与书签' }).click();
  const panel = page.getByRole('dialog', { name: '书签' });
  await panel.getByRole('button', { name: '目录' }).click();
  await expect(panel.locator('li')).toHaveCount(20);
  await panel.getByRole('button', { name: '第12章 风起12' }).click();
  await expect(page.locator('[class*=_footer_]')).toContainText('第12章 风起12');
  const firstLine = await page.evaluate(() => {
    const frame = document.querySelector('[class*=frame]')!.getBoundingClientRect();
    return [...document.querySelectorAll('[class*=columns] p')].find((p) => {
      const r = p.getClientRects()[0];
      return r && r.left >= frame.left - 1 && r.left < frame.right;
    })?.textContent;
  });
  expect(firstLine).toBe('第12章　风起12');
});

test('search finds text across the book and jumps to it', async ({ page }) => {
  await open(page);
  await tapCenter(page);
  await page.getByRole('button', { name: '目录与书签' }).click();
  const panel = page.getByRole('dialog', { name: '书签' });
  await panel.getByRole('button', { name: '搜索' }).click();
  await panel.getByRole('searchbox').fill('金色钥匙');
  await expect(panel.getByText('1 处结果')).toBeVisible();
  await panel.locator('li button').first().click();
  await expect(page.locator('[class*=columns]').getByText('终于找到了那把金色钥匙。')).toBeInViewport();

  // Many hits are listed with a count.
  await tapCenter(page);
  await page.getByRole('button', { name: '目录与书签' }).click();
  await panel.getByRole('searchbox').fill('山峦');
  await expect(panel.getByText('500+ 处结果')).toBeVisible();
});
