// 332 张闪卡逐张渲染检查：预览路由下逐张打开正面与背面，在 390 / 320 宽度下确认无整页横向溢出、无页面错误、正反面文字非空。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { total: 0, overflow: [], empty: [] };
try {
  await page.goto('http://127.0.0.1:4173/#/card-preview');
  await page.locator('.fc-pager').waitFor();
  const types = (await page.locator('[data-action=cpType]').allInnerTexts()).map((t) => t.trim());
  assert.equal(types.length, 8);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const type of types) {
      await page.locator('[data-action=cpType]', { hasText: type }).first().click();
      await page.locator('[data-action=cpFace]', { hasText: '双面' }).click();
      const total = Number((await page.locator('.fc-pager small').innerText()).split('/')[1]);
      for (let i = 0; i < total; i++) {
        const id = (await page.locator('.fc-pager small').innerText()).split(' ')[0];
        const state = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          answer: document.querySelector('.fc.back .fc-answer')?.textContent.trim().length || 0,
          front: document.querySelector('.fc.front .fc-prompt')?.textContent.trim().length || 0,
        }));
        if (width === 390) report.total++;
        if (state.width > state.client) report.overflow.push(`${width}:${id}`);
        if (!state.answer || !state.front) report.empty.push(id);
        if (i < total - 1) await page.locator('[data-action=cpStep][data-arg="1"]').click();
      }
    }
  }
  assert.equal(report.total, 332);
  assert.deepEqual(report.overflow, [], '横向溢出：' + report.overflow.join(','));
  assert.deepEqual(report.empty, []);
  assert.deepEqual(errors, []);
  console.log('332 flashcards rendered at 390 and 320 without overflow or page errors.');
} finally {
  await browser.close();
}
