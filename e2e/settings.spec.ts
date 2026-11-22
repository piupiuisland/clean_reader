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
  await page.locator('input[type=file]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
  const row = page.getByRole('listitem').filter({ hasText: '测试' });
  await expect(row).toContainText('未读');
  await expect(row).toContainText(/\d+ KB/);
});

test('menu next to home opens font size; changing it keeps position and persists', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) });
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
