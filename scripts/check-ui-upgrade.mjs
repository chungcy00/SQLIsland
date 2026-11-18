import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function route(path) {
  await page.goto("http://127.0.0.1:4173/#" + path);
  await page.locator(".appbar").waitFor();
}
try {
  await route("/");
  assert.equal(await page.locator(".learning-hero-art").count(), 1);
  await page.screenshot({ path: "artifacts/ui-v020-home.png" });
  await route("/learn");
  await page.locator("[data-action=learningStage][data-arg=核心]").click();
  await page.locator(".chapter-card").first().waitFor();
  assert.ok((await page.locator(".chapter-card").count()) > 0);
  await page.locator("[data-action=learningStage][data-arg=全部]").click();
  await page.locator("[data-action=toggleChapter][data-arg=ch02]").click();
  await page
    .locator(".chapter-card")
    .nth(1)
    .locator(".knowledge-row")
    .first()
    .waitFor();
  await page.screenshot({ path: "artifacts/ui-v020-learn.png" });
  await route("/lab");
  await page.locator("#sql-editor").waitFor();
  await page.locator("#sql-editor").fill("SELECT 42 AS answer");
  await page.waitForTimeout(200);
  await page.locator("[data-action=formatEditor]").click();
  assert.match(await page.locator("#sql-editor").inputValue(), /SELECT 42 AS answer;/);
  await page.locator("[data-action=editorUndo]").click();
  assert.equal(
    await page.locator("#sql-editor").inputValue(),
    "SELECT 42 AS answer",
  );
  await page.locator("[data-action=editorRedo]").click();
  assert.match(await page.locator("#sql-editor").inputValue(), /;$/);
  await page.locator("[data-action=editorFullscreen]").click();
  assert.equal(await page.locator(".editor-workspace.fullscreen").count(), 1);
  await page.locator("[data-action=editorFullscreen]").click();
  await page.locator("[data-action=keyboard][data-arg=字段]").click();
  await page.locator(".field-group").first().waitFor();
  assert.match(await page.locator("#keypad").innerText(), /category/);
  await page.locator("[data-action=keyboard][data-arg=语法]").click();
  await page.locator("[data-action=addQuery]").click();
  await page.locator('#sql-editor[data-id="lab:lesson:query2"]').waitFor();
  await page.locator("#sql-editor").fill("SELECT 7 AS answer");
  await page.waitForTimeout(200);
  await page.locator("[data-action=switchQuery][data-arg=query1]").click();
  await page.locator('#sql-editor[data-id="lab:lesson:query1"]').waitFor();
  assert.match(await page.locator("#sql-editor").inputValue(), /42/);
  await page.screenshot({ path: "artifacts/ui-v020-editor.png" });
  await page.locator("[data-action=runLab]").click();
  await page.getByText("42", { exact: true }).waitFor();
  await page.reload();
  await page.locator("[data-action=labTab][data-arg=代码]").click();
  assert.match(await page.locator("#sql-editor").inputValue(), /42/);
  await page.locator("[data-action=switchQuery][data-arg=query2]").click();
  await page.locator('#sql-editor[data-id="lab:lesson:query2"]').waitFor();
  assert.match(await page.locator("#sql-editor").inputValue(), /7/);
  await route("/cards");
  await page.locator("[data-action=startCards][data-arg=每日到期]").click();
  await page.locator("[data-action=flip]").click();
  await page.locator('[data-action=rate][data-arg="3"]').click();
  await page.locator("[data-action=undoRating]").click();
  await page.locator("[data-action=rate]").first().waitFor();
  assert.match(await page.locator("main").innerText(), /1 \/ 10/);
  await route("/updates");
  await page.locator("[data-action=checkUpdate]").click();
  await page
    .getByText(/更新源尚未发布版本|已是最新版本/)
    .waitFor({ timeout: 25000 });
  await page.screenshot({ path: "artifacts/ui-v020-updates.png" });
  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/learn", "/lab", "/updates"]) {
      await route(path);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        path + " " + width,
      );
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/ui-upgrade-validation.json",
    JSON.stringify(
      {
        pass: true,
        errors,
        flows: [
          "首页插画主卡",
          "课程阶段筛选与展开",
          "编辑器格式化与撤销重做",
          "全屏编辑",
          "真实字段键盘",
          "多查询草稿与重载",
          "SQL运行",
          "闪卡撤回评级",
          "真实更新源状态",
          "320/360/390/430布局",
        ],
      },
      null,
      2,
    ),
  );
  console.log("UI upgrade flows passed");
} finally {
  await browser.close();
}
