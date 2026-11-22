import { expect, test, type Page } from '@playwright/test';

const BOOK = Array.from({ length: 10 }, (_, n) =>
  `第${n + 1}章　测试\n` + Array.from({ length: 30 }, (_, i) => `　　第${n + 1}章第${i + 1}段，他抬起头，望向远处的山峦，夜色渐深。`).join('\n'),
).join('\n');

const vp = (page: Page) => page.viewportSize()!;
const tapRight = (page: Page) => page.mouse.click(vp(page).width * 0.9, vp(page).height * 0.6);
const tapCenter = (page: Page) => page.mouse.click(vp(page).width / 2, vp(page).height * 0.5);

async function firstVisibleParagraph(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[class*=frame]')!.getBoundingClientRect();
    for (const p of document.querySelectorAll('[class*=columns] p')) {
      for (const r of p.getClientRects()) if (r.left >= frame.left - 1 && r.left < frame.right) return p.textContent;
    }
    return null;
  });
}

test('bookshelf is a list with file size in the subtitle', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  const row = page.getByRole('listitem').filter({ hasText: '测试' });
  await expect(row).toContainText('未读');
  await expect(row).toContainText(/\d+ KB/);
});

test('menu next to home opens font size; changing it keeps position and persists', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: '测试', exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  for (let i = 0; i < 8; i++) await tapRight(page);
  const before = await firstVisibleParagraph(page);

  await tapCenter(page);
  await page.getByRole('button', { name: '菜单' }).click();
  const sheet = page.getByRole('region', { name: '阅读设置' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('19');

  const size = () => page.locator('[class*=columns]').evaluate((el) => getComputedStyle(el).fontSize);
  await sheet.getByRole('button', { name: '字号增大' }).click();
  await sheet.getByRole('button', { name: '字号增大' }).click();
  await expect(sheet).toContainText('21');
  expect(await size()).toBe('21px');
  // The paragraph we were reading is still on screen after re-pagination.
  const visibleAfter = await page.evaluate((text) => {
    const frame = document.querySelector('[class*=frame]')!.getBoundingClientRect();
    const p = [...document.querySelectorAll('[class*=columns] p')].find((x) => x.textContent === text)!;
    return [...p.getClientRects()].some((r) => r.left >= frame.left - 1 && r.left < frame.right);
  }, before);
  expect(visibleAfter).toBe(true);

  await sheet.getByRole('slider', { name: '字号' }).fill('30');
  expect(await size()).toBe('30px');
  await expect(sheet.getByRole('button', { name: '字号增大' })).toBeDisabled();

  await page.waitForTimeout(500); // > settings save debounce
  await page.reload();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  expect(await size()).toBe('30px');
});

test('new books default to 柔和夜间黑 + 宋体; 字体 menu switches typeface and persists', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: '测试', exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  const reader = page.locator('[data-theme]');
  const family = () => page.locator('[class*=columns]').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await reader.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 32, 35)');
  expect(await family()).toContain('Songti SC');

  await tapCenter(page);
  await page.getByRole('button', { name: '菜单' }).click();
  const sheet = page.getByRole('region', { name: '阅读设置' });
  await sheet.getByRole('button', { name: '字体', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: '宋体' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: '楷体' }).click();
  expect(await family()).toContain('Kaiti SC');

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  expect(await family()).toContain('Kaiti SC');
});

test('menu has font size and theme buttons; theme changes colours and persists', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  await page.getByRole('button', { name: '测试', exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();

  await tapCenter(page);
  await page.getByRole('button', { name: '菜单' }).click();
  const sheet = page.getByRole('region', { name: '阅读设置' });
  await expect(sheet.getByRole('button', { name: '字号', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: '主题', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: '字号' })).toBeHidden();

  const reader = page.locator('[data-theme]');
  const colors = () => reader.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  await sheet.getByRole('radio', { name: '护眼' }).click();
  await expect(sheet.getByRole('radio', { name: '护眼' })).toHaveAttribute('aria-checked', 'true');
  expect(await colors()).toEqual(['rgb(207, 224, 203)', 'rgb(38, 51, 31)']);
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', /#cfe0cb/i);

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  expect(await colors()).toEqual(['rgb(207, 224, 203)', 'rgb(38, 51, 31)']);
});
