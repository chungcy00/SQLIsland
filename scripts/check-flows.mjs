import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = "http://127.0.0.1:4173";
async function route(path) {
  await page.goto(base + "/#" + path);
  await page.locator(".appbar").waitFor();
}
try {
  await route("/");
  assert.match(await page.locator("h1").first().innerText(), /数屿SQL/);
  await route("/lesson/kp01-01");
  await page.getByRole("button", { name: "运行兼容示例" }).click();
  await page
    .locator("#lesson-result")
    .getByText("本次 SQLite 兼容执行结果")
    .waitFor();
  await page.getByRole("button", { name: "完成学习", exact: true }).click();
  await page.getByRole("button", { name: "已完成学习" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "已完成学习" }).waitFor();
  await route("/question/q0005");
  await page.locator("[data-action=option][data-arg=D]").click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确", { exact: true }).waitFor();
  await route("/question/q0009");
  await page
    .locator("#sql-editor")
    .fill("SELECT DISTINCT price FROM products ORDER BY price");
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "运行", exact: true }).click();
  await page.locator("table").waitFor();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确", { exact: false }).waitFor();
  await route("/cards");
  // 闪卡界面改版后：选“新卡”模式开始，整张卡点击翻面，再评“良好”进入下一张；刷新后会话恢复。
  await page.locator("[data-action=cardMode][data-arg=新卡]").click();
  await page.locator("[data-action=startCards]").click();
  await page.waitForURL("**/#/review");
  await page.locator(".fc-tap .fc.front").waitFor();
  await page.locator(".fc-tap .fc.front").click();
  await page.locator(".fc-tap .fc.back").waitFor();
  await page.getByRole("button", { name: /记得/ }).click();
  await page.locator(".fc-tap .fc.front").waitFor();
  await page.reload();
  await page.locator(".fc-tap").waitFor();
  await route("/card-edit/new");
  await page.locator("#card-front").fill("COUNT(*) 计算什么？");
  await page.locator("#card-back").fill("输入记录的行数。");
  await page.getByRole("button", { name: "保存闪卡", exact: true }).click();
  await page.getByText("COUNT(*) 计算什么？", { exact: true }).waitFor();
  await route("/lab");
  await page
    .locator("#sql-editor")
    .fill(
      "SELECT category,SUM(sales) AS total FROM orders GROUP BY category ORDER BY category;",
    );
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "运行 SQL", exact: false }).click();
  await page.getByText("返回 3 行").waitFor();
  await route("/import");
  await page
    .locator("#dataset-file")
    .setInputFiles({
      name: "测试数据.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("item,amount\na,12\nb,18"),
    });
  await page.getByRole("button", { name: "确认导入", exact: true }).waitFor();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await page.getByText("imported_data", { exact: true }).waitFor();
  await route("/mine");
  await page.screenshot({ path: "artifacts/preview-mine.png" });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/learn", "/practice", "/cards", "/mine"]) {
      await route(path);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `overflow ${width} ${path}`,
      );
    }
  }
  await writeFile(
    "artifacts/browser-validation.json",
    JSON.stringify(
      {
        pass: true,
        errors,
        flows: [
          "课程运行",
          "完成记录重载",
          "选择题提交",
          "SQL真实查询",
          "FSRS评级与会话恢复",
          "个人闪卡新增",
          "实验室分组查询",
          "CSV导入",
          "320/360/390/430五导航无整页横向溢出",
        ],
      },
      null,
      2,
    ),
  );
  assert.equal(errors.length, 0);
  console.log("Browser flows passed");
} finally {
  await browser.close();
}
