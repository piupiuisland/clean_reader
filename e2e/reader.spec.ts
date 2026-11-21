import { expect, test, type Page } from '@playwright/test';

const chapter = (n: number) =>
  `第${n}章　测试\n` +
  Array.from({ length: 40 }, (_, i) => `　　这是第${n}章的第${i + 1}段，内容用来测试阅读位置的保存与恢复。`.repeat(1 + (i % 3))).join('\n');
const BOOK = Array.from({ length: 30 }, (_, i) => chapter(i + 1)).join('\n\n');

/** Text of every line fragment currently visible inside the page frame, top-to-bottom. */
async function visibleLines(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const frame = document.querySelector('[class*=frame]')!.getBoundingClientRect();
    const out: { top: number; text: string }[] = [];
    for (const p of document.querySelectorAll('[class*=columns] p')) {
      const node = p.firstChild as Text | null;
      if (!node) continue;
      const r = document.createRange();
      // Walk characters, grouping those that are on-screen by line top.
      let line = '';
      let lineTop = NaN;
      for (let i = 0; i < node.length; i++) {
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect();
        const cx = b.left + b.width / 2;
        if (cx < frame.left || cx > frame.right) continue;
        if (b.top !== lineTop && line) {
          out.push({ top: lineTop, text: line });
          line = '';
        }
        lineTop = b.top;
        line += node.data[i];
      }
      if (line) out.push({ top: lineTop, text: line });
    }
    return out.sort((a, b) => a.top - b.top).map((l) => l.text);
  });
}

const firstLine = async (page: Page) => (await visibleLines(page))[0] ?? '';

async function tapZone(page: Page, zone: 'left' | 'center' | 'right') {
  const vp = page.viewportSize()!;
  const x = zone === 'left' ? vp.width * 0.1 : zone === 'right' ? vp.width * 0.9 : vp.width / 2;
  await page.mouse.click(x, vp.height * 0.85); // lower part of the screen, like a thumb tap
}

async function importAndOpen(page: Page, name: string, content: string | Buffer) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: typeof content === 'string' ? Buffer.from(content, 'utf-8') : content,
  });
  await page.getByRole('button', { name: name.replace(/\.txt$/, ''), exact: true }).click();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
}

test('tap right/left turns pages without missing or repeating text', async ({ page }) => {
  await importAndOpen(page, '测试小说.txt', BOOK);
  expect(await firstLine(page)).toContain('第1章');

  // Read 25 pages forward (crosses an internal section boundary) and collect every line.
  const seen: string[] = [];
  const pages: string[][] = [];
  for (let i = 0; i < 25; i++) {
    const lines = await visibleLines(page);
    pages.push(lines);
    seen.push(...lines);
    await tapZone(page, 'right');
  }
  // Concatenating all visible lines must reproduce the book text exactly (ignoring paragraph breaks/indent).
  const flat = BOOK.replace(/[\s　]/g, '');
  const read = seen.join('').replace(/[\s　]/g, '');
  expect(flat.startsWith(read)).toBe(true);
  expect(read.length).toBeGreaterThan(3000);

  // Tap left goes back exactly one page.
  const here = await visibleLines(page);
  await tapZone(page, 'left');
  expect(await visibleLines(page)).toEqual(pages[24]);
  await tapZone(page, 'right');
  expect(await visibleLines(page)).toEqual(here);
});

test('resume the exact page after reload, and after a viewport change', async ({ page }) => {
  await importAndOpen(page, '测试小说.txt', BOOK);
  for (let i = 0; i < 12; i++) await tapZone(page, 'right');
  const before = await firstLine(page);
  await page.waitForTimeout(900); // > save debounce

  await page.reload();
  await expect(page.locator('[class*=columns] p').first()).toBeVisible();
  expect(await firstLine(page)).toBe(before);

  // Rotate-like resize: the anchored text must still be on screen.
  await page.setViewportSize({ width: 600, height: 420 });
  await page.waitForTimeout(200);
  expect((await visibleLines(page)).join('')).toContain(before);
  await page.setViewportSize({ width: 393, height: 659 });
  await page.waitForTimeout(200);
  expect(await firstLine(page)).toBe(before);
});

test('center tap shows a whole-book progress bar that moves the page live', async ({ page }) => {
  await importAndOpen(page, '测试小说.txt', BOOK);
  await tapZone(page, 'center');
  const slider = page.getByRole('slider', { name: '阅读进度' });
  const label = page.locator('[class*=percent]');
  await expect(slider).toBeVisible();

  await slider.fill('500'); // 50.0%
  await expect(label).toHaveText('50%');
  await expect.poll(() => firstLine(page)).toMatch(/第1[456]章/);

  // Tap the page to hide the bar; the footer shows the same number.
  await tapZone(page, 'center');
  await expect(slider).toBeHidden();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
});

test('the number next to the bar always equals where it was dragged', async ({ page }) => {
  await importAndOpen(page, '测试小说.txt', BOOK);
  await tapZone(page, 'center');
  const slider = page.getByRole('slider', { name: '阅读进度' });
  const label = page.locator('[class*=percent]');

  for (const [value, expected] of [
    ['0', '0%'], ['37', '4%'], ['123', '12%'], ['500', '50%'], ['777', '78%'], ['999', '100%'], ['1000', '100%'],
  ] as const) {
    await slider.fill(value);
    await expect(label).toHaveText(expected);
    await slider.dispatchEvent('pointerup'); // release
    await page.waitForTimeout(50);
    await expect(label).toHaveText(expected); // no snapping after release
    await expect(slider).toHaveValue(value);
  }

  // Turning a page afterwards shows the real position again (and the bar follows it).
  await slider.fill('500');
  await slider.dispatchEvent('pointerup');
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(label).toHaveText(/^5[01]%$/);
});

test('GBK file and rename/delete', async ({ page }) => {
  // "中文小说，第一章。" encoded as GBK
  const gbk = Buffer.from('d6d0cec4d0a1cbb5a3acb5dad2bbd5c2a1a3', 'hex');
  await importAndOpen(page, 'gbk.txt', gbk);
  await expect(page.getByText('中文小说，第一章。')).toBeVisible();
  await tapZone(page, 'center');
  await page.getByRole('button', { name: '返回书架' }).click();

  await page.getByRole('button', { name: 'gbk 更多操作' }).click();
  await page.getByRole('button', { name: '重命名' }).click();
  await page.getByRole('textbox').fill('新名字');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: '新名字 更多操作' })).toBeVisible();

  await page.getByRole('button', { name: '新名字 更多操作' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除' }).click();
  await expect(page.getByText('书架还是空的')).toBeVisible();
});
