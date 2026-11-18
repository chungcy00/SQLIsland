import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  pass: true,
  widths: [],
  keyboardHeightRemembered: false,
  inlineTableNoJump: false,
  fullscreenIcons: false,
  errors: [],
};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/#/lab/retail-v2");
  await page.locator(".keyboard-resize").waitFor();
  const height = () =>
    page
      .locator(".keyboard-wrap")
      .evaluate((node) => Math.round(node.getBoundingClientRect().height));
  const initial = await height();
  const handle = await page.locator(".keyboard-resize").boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2 - 100,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(150);
  const resized = await height();
  assert.equal(resized, initial + 100);
  await page.reload();
  await page.locator(".keyboard-resize").waitFor();
  assert.equal(await height(), resized);
  report.keyboardHeightRemembered = true;
  const fullscreen = page.locator("[data-action=editorFullscreen]");
  const expand = await fullscreen.locator("path").getAttribute("d");
  await fullscreen.click();
  assert.equal(await fullscreen.innerText(), "退出全屏");
  const shrink = await fullscreen.locator("path").getAttribute("d");
  assert.notEqual(shrink, expand);
  await page.screenshot({
    path: "artifacts/enterprise-audit/editor-fullscreen.png",
  });
  await fullscreen.click();
  assert.equal(await fullscreen.locator("path").getAttribute("d"), expand);
  report.fullscreenIcons = true;
  await page.locator(".keyboard-resize").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await height(), resized - 20);
  await page.locator("[data-action=labTab][data-arg=数据表]").click();
  const row = page.locator(
    "[data-action=previewTable][data-arg=calendar_days]",
  );
  await row.waitFor();
  await page.evaluate(() => window.scrollTo(0, 90));
  const position = await row.evaluate((node) => ({
    top: node.getBoundingClientRect().top,
    scroll: window.scrollY,
  }));
  await row.click();
  const preview = row.locator("..").locator(".table-preview");
  await preview.locator("table").waitFor();
  const after = await row.evaluate((node) => ({
    top: node.getBoundingClientRect().top,
    scroll: window.scrollY,
  }));
  assert.ok(
    Math.abs(after.scroll - position.scroll) <= 1,
    JSON.stringify({ position, after }),
  );
  assert.ok(Math.abs(after.top - position.top) <= 1);
  report.inlineTableNoJump = true;
  const next = page.locator(
    '[data-action="previewTable"][data-arg="categories"]',
  );
  await next.scrollIntoViewIfNeeded();
  const nextPosition = await next.evaluate(node => node.getBoundingClientRect().top);
  await next.click();
  await next.locator("..").locator(".table-preview table").waitFor();
  assert.equal(await page.locator(".table-preview:not([hidden])").count(), 1);
  assert.equal(await preview.isVisible(), false);
  const nextAfter = await next.evaluate(node => ({ top: node.getBoundingClientRect().top, scroll: scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight }));
  const expectedScroll = Math.max(0, Math.min(nextAfter.maxScroll, nextAfter.top + nextAfter.scroll - nextPosition));
  assert.ok(Math.abs(nextAfter.scroll - expectedScroll) <= 2, JSON.stringify({nextPosition,nextAfter,expectedScroll}));
  report.singleExpandedTable = true;
  await row.click();
  await preview.locator("table").waitFor();

  await page.screenshot({
    path: "artifacts/enterprise-audit/inline-preview.png",
  });
  await row.click();
  assert.equal(await preview.isVisible(), false);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await page.locator("[data-action=labTab][data-arg=代码]").click();
    await page.locator(".keyboard-resize").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.ok((await height()) <= Math.floor(720 * 0.62));
    report.widths.push(width);
  }
  await page.goto("http://127.0.0.1:4173/#/question/q0002");
  await page.locator(".quiz-title").waitFor();
  assert.equal(
    await page.locator(".quiz-title").innerText(),
    "NULL 与缺失记录",
  );
  assert.match(
    await page.locator("main").innerText(),
    /数据库中的 NULL 与数字0在表示销售额时有什么根本区别/,
  );
  await page.screenshot({
    path: "artifacts/enterprise-audit/question-short-title.png",
  });
  report.questionTitleCompact = true;
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.pass = false;
  throw error;
} finally {
  report.sourceHashes = {};
  for (const file of ["src/app.js", "src/style.css", "src/store.js"])
    report.sourceHashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  await browser.close();
  await writeFile(
    "artifacts/enterprise-audit/browser-validation.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(
  "Keyboard drag/memory, expand/shrink icons, inline preview and mobile widths passed.",
);
