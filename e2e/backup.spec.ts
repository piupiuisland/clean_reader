import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const BOOK = Array.from({ length: 6 }, (_, n) =>
  `第${n + 1}章　测试\n` + Array.from({ length: 30 }, (_, i) => `　　第${n + 1}章第${i + 1}段，他抬起头，望向远处的山峦。`).join('\n'),
).join('\n');
const TXT = { name: '备份测试.txt', mimeType: 'text/plain', buffer: Buffer.from(BOOK) };

const vp = (page: Page) => page.viewportSize()!;
const tapRight = (page: Page) => page.mouse.click(vp(page).width * 0.9, vp(page).height * 0.6);
const tapCenter = (page: Page) => page.mouse.click(vp(page).width / 2, vp(page).height * 0.5);

test('export a backup, lose the data, re-import the TXT and restore bookmarks + progress', async ({ page }) => {
  // Force the download path (desktop WebKit has no file share sheet).
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));
  await page.goto('/');
  await page.locator('input[type=file][accept*=txt]').setInputFiles(TXT);
  await page.getByRole('button', { name: '备份测试', exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  for (let i = 0; i < 5; i++) await tapRight(page);
  await page.mouse.click(vp(page).width - 20, 20); // top-right corner: bookmark
  await expect(page.getByLabel('本页已加书签')).toBeVisible();
  await tapCenter(page);
  await page.getByRole('button', { name: '返回书架' }).click();
  const meta = page.getByRole('listitem').filter({ hasText: '备份测试' });
  const percent = (await meta.textContent())!.match(/\d+%/)![0];

  await page.getByRole('button', { name: '阅读数据备份' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^PureReader-备份-\d{4}-\d\d-\d\d\.json$/);
  const json = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(json.books[0].bookmarks).toHaveLength(1);

  // Delete the book (removes progress and bookmarks), then import it again.
  await page.getByRole('button', { name: '备份测试 更多操作' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.locator('input[type=file][accept*=txt]').setInputFiles(TXT);
  await expect(meta).toContainText('未读');

  await page.getByRole('button', { name: '阅读数据备份' }).click();
  await page.getByRole('button', { name: '导入备份' }).click();
  await page.locator('input[type=file][accept*=json]').setInputFiles((await file.path())!);
  await expect(page.getByText('已恢复 1 本书的数据：1 条阅读进度，1 个新书签。')).toBeVisible();
  await page.getByRole('button', { name: '好' }).click();
  await expect(meta).toContainText(percent);

  await page.getByRole('button', { name: '备份测试', exact: true }).click();
  await expect(page.getByLabel('本页已加书签')).toBeVisible(); // reopened on the bookmarked page
});

test('importing a wrong file shows an error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读数据备份' }).click();
  await page.getByRole('button', { name: '导入备份' }).click();
  await page.locator('input[type=file][accept*=json]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(page.getByText('导入失败：这不是 PureReader 的备份文件。')).toBeVisible();
});
