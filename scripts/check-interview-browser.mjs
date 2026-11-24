// 面试刷题（需要 4173 预览服务与已构建的 dist）：
// 列表页与筛选；98 题逐题在浏览器里用参考答案提交必须“回答正确”，错误答案必须被拒绝；
// 数据表页签；上一题/下一题；390/320 宽无整页横向溢出。
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const content = JSON.parse(fs.readFileSync("dist/content.json"));
const questions = content.interview;
assert.equal(questions.length, 98);
const base = "http://127.0.0.1:4173/#";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
try {
  // 练习页入口
  await page.goto(base + "/practice");
  await page.locator(".interview-card").waitFor();
  assert.match(await page.locator(".interview-card").innerText(), /面试刷题[\s\S]*98 道/);
  assert.match(await page.locator(".route-summary small").innerText(), /\/ 120 题/, "章节练习是 120 题");
  await page.locator(".interview-card").click();
  await page.waitForURL("**#/interview");

  // 列表与筛选
  await page.locator(".interview-list .link-row").first().waitFor();
  assert.equal(await page.locator(".interview-list .link-row").count(), 98);
  assert.equal(await overflow() <= 0, true, "列表页横向溢出");
  await page.locator('[data-arg="中等"].chip').click();
  const middle = questions.filter((q) => q.difficulty === "中等").length;
  assert.equal(await page.locator(".interview-list .link-row").count(), middle);
  await page.locator('[data-action=resetInterview]').click();
  await page.locator("#interview-search").fill("牛客");
  await page.waitForFunction(() => document.querySelectorAll(".interview-list .link-row").length === 3);
  await page.locator("#interview-search").fill("");
  await page.locator('[data-ifilter=platform]').selectOption("LintCode");
  await page.waitForFunction(() => document.querySelectorAll(".interview-list .link-row").length === 3);
  await page.locator('[data-action=resetInterview]').click();
  await page.waitForFunction(() => document.querySelectorAll(".interview-list .link-row").length === 98);
  await page.locator('[data-action=randomQuestion]').click();
  await page.waitForURL(/#\/question\/i\d{3}$/);
  await page.locator("#sql-editor").waitFor();

  // 逐题提交
  let index = 0;
  for (const q of questions) {
    index++;
    await page.goto(base + "/question/" + q.id);
    await page.waitForFunction((title) => document.querySelector(".quiz-title")?.textContent === title && document.querySelector("#sql-editor"), q.title);
    const meta = await page.locator(".iv-meta").innerText();
    assert.ok(meta.includes(`${index} / 98`), q.id + " " + meta);
    // 统一阅读模板：区块顺序固定，缺数据的区块不出现
    const headings = await page.locator('.quiz-pane[data-pane="题目"] .iv-section h2').allTextContents();
    assert.deepEqual(headings.slice(0, 5), ["题目描述", "任务要求", "输出要求", "示例输入", headings[4]], q.id + " " + headings);
    assert.ok(headings[4].startsWith("示例输出"), q.id);
    assert.ok(!headings.includes("示例说明"), q.id + " 不应虚构示例说明");
    assert.ok((await page.locator('.quiz-pane[data-pane="题目"] .iv-section').count()) === headings.length);
    await page.locator("#sql-editor").fill("SELECT 1 AS wrong_answer");
    await page.locator("[data-action=submitQuestion]").click();
    await page.waitForFunction(() => document.querySelector(".judge-feedback .notice, .judge-feedback .status-bar, .judge-feedback")?.textContent.trim().length > 0);
    assert.ok(!(await page.locator(".judge-feedback").innerText()).includes("回答正确"), q.id + " 错误答案被判正确");
    await page.locator("#sql-editor").fill(q.referenceSolutions[0].sqliteSql);
    await page.locator("[data-action=submitQuestion]").click();
    await page.waitForFunction(() => document.querySelector(".judge-feedback")?.textContent.includes("回答正确"), null, { timeout: 30000 });
    if (index % 14 === 1) {
      await page.locator('.tabs [data-arg=数据表]').click();
      await page.waitForFunction(() => document.querySelector(".iv-schema table"));
      assert.deepEqual(await page.locator(".iv-schema").first().locator("h4").allTextContents(), ["字段", "示例数据"], q.id);
      assert.ok((await page.locator(".source-table-name").count()) >= 1, q.id + " 数据表为空");
      await page.locator('.tabs [data-arg=题目]').click();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await overflow() <= 0, true, `${q.id} 在 ${width} 宽横向溢出`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
  }
  // 列表里已全部“已独立完成”
  await page.goto(base + "/interview");
  await page.locator(".interview-list .link-row").first().waitFor();
  assert.match(await page.locator(".route-summary small").innerText(), /98 \/ 98/);
  // 相邻题切换保持在面试题库内
  await page.goto(base + "/question/i001");
  await page.locator("#sql-editor").waitFor();
  await page.locator("[data-action=adjacentQuestion]").last().click();
  await page.waitForURL("**#/question/i002");
  assert.deepEqual(errors, []);
  console.log("面试刷题浏览器检查通过：98 题参考答案全部判为正确，错误答案全部被拒绝");
} finally {
  await browser.close();
}
