import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
let root = path.resolve(".tooling/audit-migration-source/dist");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".html": "text/html",
};
const server = http.createServer(async (request, response) => {
  try {
    const file = path.resolve(
      root,
      "." + (request.url === "/" ? "/index.html" : request.url),
    );
    assert.ok(file.startsWith(root + path.sep));
    const data = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(4181, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  pass: false,
  environment:
    "同一浏览器来源，真实备份的0.2.1构建覆盖为0.3.0；通过正常界面建立笔记、收藏、完成状态和SQL草稿",
  checked: [],
};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  async function state() {
    return page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("sql-shouji", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const get = request.result
              .transaction("records")
              .objectStore("records")
              .get("state");
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          };
        }),
    );
  }
  await page.goto("http://127.0.0.1:4181/#/lesson/kp01-01");
  await page.locator("#note").waitFor();
  await page.locator("#note").fill("升级保留测试笔记，NULL无需填补。");
  await page.locator("[data-action=favorite]").click();
  await page.getByRole("button", { name: "完成学习", exact: true }).click();
  await page.getByRole("button", { name: "已完成学习", exact: true }).waitFor();
  await page.goto("http://127.0.0.1:4181/#/lab/retail-v2");
  await page.locator("#sql-editor").waitFor();
  await page.locator("#sql-editor").fill("SELECT COUNT(*) FROM promotions;");
  await page.waitForTimeout(800);
  const before = await state();
  assert.ok(before.completed.includes("kp01-01"));
  assert.equal(before.notes["kp01-01"], "升级保留测试笔记，NULL无需填补。");
  root = path.resolve("dist");
  await page.reload();
  await page.locator("#sql-editor").waitFor();
  const after = await state();
  assert.equal(after.contentVersion, "4.2.0");
  for (const key of [
    "completed",
    "notes",
    "favorites",
    "drafts",
    "attempts",
    "reviews",
    "reviewEvents",
    "userCards",
    "labWorkspaces",
  ]) {
    assert.deepEqual(after[key], before[key], key);
    report.checked.push(key);
  }
  assert.equal(after.settings.keyboardHeight, 240);
  assert.equal(
    await page.locator("#sql-editor").inputValue(),
    "SELECT COUNT(*) FROM promotions;",
  );
  report.previousContentVersion = before.contentVersion;
  report.currentContentVersion = after.contentVersion;
  report.pass = true;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    "artifacts/enterprise-audit/browser-migration.json",
    JSON.stringify(report, null, 2),
  );
}
console.log("Actual 0.2.1 to 0.3.0 browser storage migration passed.");
