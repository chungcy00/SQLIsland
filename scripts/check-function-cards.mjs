// 函数用法卡新版背面检查（53 张）：栏目顺序、折叠默认关闭、没有底部重复的运行区、没有开发验证术语，
// 并且每个示例点“运行”后，结果与卡片记录的结果一致。需要预览服务（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ids = await (async () => {
  await page.goto('http://127.0.0.1:4173/#/cards'); await page.locator('#card-search').waitFor();
  return page.evaluate(async () => (await (await fetch('content.json')).json()).cards.filter((c) => c.type === 'function').map((c) => c.id));
})();
assert.equal(ids.length, 53);
// 本应用的 SQLite 环境与 MySQL 行为不同、已在兼容说明中写明的示例（卡片号 + 第几个示例）。
const KNOWN = ['fc2-0146 第 3 个示例'];
const ORDER = ['核心答案', '函数语法', '参数说明', '返回值', '用法示例', '实际应用', '注意事项'];
let runs = 0;
const mismatches = [];
try {
  for (const id of ids) {
    await page.goto('http://127.0.0.1:4173/#/cards'); await page.locator('#card-search').waitFor();
    await page.locator('#card-search').fill(id);
    await page.waitForFunction(() => document.querySelectorAll('.fc-mini').length === 1);
    await page.locator('.fc-mini').click();
    await page.locator('.fc-open .fc-fn-answer').waitFor();
    const heads = await page.locator('.fc-open > .fc-tap > .fc > .fc-sec > .fc-h, .fc-open .fc-fn-answer > .fc-h').allInnerTexts().catch(() => []);
    const titles = await page.$$eval('.fc-open .fc-sec > h3.fc-h', (n) => n.map((x) => x.textContent.trim()));
    assert.deepEqual(titles.filter((t) => ORDER.includes(t)), ORDER.filter((t) => titles.includes(t)), `${id} 栏目顺序`);
    for (const must of ['核心答案', '函数语法', '用法示例']) assert.ok(titles.includes(must), `${id} 缺少栏目 ${must}`);
    assert.equal(await page.locator('.fc-open .fc-runs').count(), 0, `${id} 不应再有底部的运行示例区`);
    assert.equal(await page.locator('.fc-open .fc-fn-compat').evaluate((n) => n.open), false, `${id} 兼容性说明应默认折叠`);
    const text = await page.locator('.fc-open .fc.back').innerText();
    assert.ok(!/宿主|教学预期|验收边界|原句/.test(text), `${id} 出现开发验证术语`);
    // 展开所有折叠的边界示例，再逐个运行并与记录的结果比较
    await page.$$eval('.fc-open .fc-fn-fold', (n) => n.forEach((d) => { d.open = true; }));
    const slots = await page.locator('.fc-open .fc-fn-result').count();
    assert.ok(slots >= 1, `${id} 没有示例`);
    for (let i = 0; i < slots; i++) {
      const slot = page.locator('.fc-open .fc-fn-result').nth(i);
      const rows = (loc) => loc.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
      const before = await rows(slot.locator('.fc-run-out'));
      await slot.locator('[data-action="cardRun"]').click();
      await slot.locator('.fc-run-out .result-tag').waitFor();
      const after = await rows(slot.locator('.fc-run-out'));
      const norm = (r) => JSON.stringify(r.map((x) => x.map((v) => (v === 'NULL' ? '' : v))));
      if (norm(after) !== norm(before)) mismatches.push(`${id} 第 ${i + 1} 个示例：运行 ${JSON.stringify(after)} ≠ 记录 ${JSON.stringify(before)}；页面提示：${(await slot.locator('.fc-run-out small').first().innerText()).trim()}`);
      runs++;
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Function cards: 53 cards, ${runs} examples ran in place.`);
  if (mismatches.length) console.log('Local run differs from the recorded result:\n' + mismatches.join('\n'));
  assert.deepEqual(mismatches.filter((m) => !KNOWN.some((k) => m.startsWith(k))), [], '有未登记的运行结果差异');
} finally { await browser.close(); }
