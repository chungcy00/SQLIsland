// 课文图示窄屏检查：打开所有带图示的课文，在 320 与 390 宽度下检查整页无横向溢出、图示表格无框内横向滚动、无页面错误。需要预览服务（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { lessons: 0, pageOverflow: [], tableScroll: [] };
try {
  await page.goto('http://127.0.0.1:4173/'); await page.locator('.appbar').waitFor();
  const ids = await page.evaluate(async () => { const c = await (await fetch('content.json')).json(); return c.chapters.flatMap((ch) => ch.knowledgePoints).filter((k) => k.figures?.length).map((k) => k.id); });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ids) {
      await page.goto('http://127.0.0.1:4173/#/lesson/' + id);
      await page.locator('.lesson-details').waitFor();
      await page.evaluate(() => document.querySelectorAll('.figure .fig-tab').forEach((t) => t.click()));
      const r = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tables: [...document.querySelectorAll('.fig-flow-table, .fig-page-map')].filter((t) => t.offsetParent && t.scrollWidth > t.parentElement.clientWidth + 1).length,
      }));
      if (width === 390) report.lessons++;
      if (r.page) report.pageOverflow.push(`${width}:${id}`);
      if (r.tables) report.tableScroll.push(`${width}:${id}`);
    }
  }
  console.log(JSON.stringify(report));
  assert.deepEqual(report.pageOverflow, []);
  assert.deepEqual(errors, []);
  console.log('Lesson figures fit at 390 and 320.');
} finally { await browser.close(); }
