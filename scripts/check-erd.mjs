import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import initSqlJs from "sql.js";
const expected = JSON.parse(
  await readFile("artifacts/enterprise-audit/erd-metadata.json"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  pass: false,
  datasets: [],
  errors: [],
  externalRequests: [],
  touchPan: false,
  touchPinch: false,
  fieldPorts: false,
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.hasOwn = undefined;
    window.structuredClone = undefined;
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173/"))
      report.externalRequests.push(request.url());
  });
  await page.goto("http://127.0.0.1:4173/#/lab/retail-v2");
  await page.locator("[data-action=labTab][data-arg=数据表]").click();
  await page.locator(".lab-table").first().waitFor();
  assert.equal(
    await page.locator(".lab-data-tabs .selected").innerText(),
    "数据表列表",
  );
  await page.locator("[data-action=labDataView][data-arg=erd]").click();
  for (const dataset of expected.datasets) {
    if ((await page.locator("#lab-dataset").inputValue()) !== dataset.id)
      await page.locator("#lab-dataset").selectOption(dataset.id);
    await page
      .locator(`#lab-erd[data-dataset="${dataset.id}"] .erd-node`)
      .first()
      .waitFor();
    await page.locator(".erd-scope").selectOption("all");
    await page.waitForFunction(
      (count) => document.querySelectorAll(".erd-node").length === count,
      dataset.objects,
    );
    assert.equal(
      await page.locator(".erd-relation.foreign").count(),
      dataset.foreignKeys,
      dataset.id,
    );
    assert.equal(await page.locator(".erd-field").count(), dataset.columns);
    assert.equal(await page.locator("[data-erd-action=fields]").count(), 0);
    const overlaps = await page.locator(".erd-node").evaluateAll((nodes) =>
      nodes.flatMap((node, index) =>
        nodes
          .slice(index + 1)
          .filter((other) => {
            const a = node.getBoundingClientRect(),
              b = other.getBoundingClientRect();
            return (
              Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
              Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1
            );
          })
          .map((other) => [node.dataset.table, other.dataset.table]),
      ),
    );
    assert.deepEqual(overlaps, [], dataset.id);
    assert.equal(
      await page.locator(".erd-relation.view").count(),
      dataset.viewDependencies,
      dataset.id,
    );
    assert.equal(await page.locator(".erd-relation.logical").count(), 0);
    assert.equal(await page.locator(".erd-warnings").count(), 0);
    report.datasets.push({
      id: dataset.id,
      objects: await page.locator(".erd-node").count(),
      foreignKeys: await page.locator(".erd-relation.foreign").count(),
      viewDependencies: await page.locator(".erd-relation.view").count(),
    });
  }
  // Search positions a real table at a readable zoom, then highlights exactly its neighborhood.
  const search = page.locator(".erd-search-input");
  await search.fill("orders");
  await page.locator(".erd-search-results [data-table=orders]").click();
  assert.equal(
    await page.locator(".erd-node.selected").getAttribute("data-table"),
    "orders",
  );
  assert.ok((await page.locator(".erd-relation.highlighted").count()) > 0);
  const orderNode = page.locator(".erd-node[data-table=orders]");
  const card = await orderNode.boundingBox();
  const viewport = page.locator(".erd-viewport");
  await viewport.scrollIntoViewIfNeeded();
  // Verify a physical FK endpoint touches the actual field row, after camera transform.
  report.fieldPorts = await page.evaluate(() => {
    const group =
      document.querySelector(
        '.erd-relation.foreign[data-relation="fk:orders:0"]',
      ) ||
      [...document.querySelectorAll(".erd-relation.foreign")].find((group) =>
        group.getAttribute("aria-label").startsWith("orders("),
      );
    const table = group.getAttribute("aria-label").split("(")[0];
    const wire = group.querySelector("path");
    const name = wire.dataset.fromField;
    const field = [...document.querySelectorAll(".erd-node")]
      .find((node) => node.dataset.table === table)
      .querySelector(`[data-field="${name}"]`);
    const rect = field.getBoundingClientRect();
    const point = new DOMPoint(
      ...wire
        .getAttribute("d")
        .match(/^M ([\d.\-]+) ([\d.\-]+)/)
        .slice(1)
        .map(Number),
    ).matrixTransform(wire.getScreenCTM());
    return (
      Math.abs(point.y - (rect.top + rect.height / 2)) < 1.5 &&
      Math.min(Math.abs(point.x - rect.left), Math.abs(point.x - rect.right)) <
        1.5
    );
  });
  assert.equal(report.fieldPorts, true);
  assert.equal(await page.locator("[data-erd-action=fields]").count(), 0);
  await page
    .locator(".erd-node[data-table=orders] [data-field=order_date]")
    .click({ force: true });
  assert.match(
    await page.locator(".erd-inspector").innerText(),
    /日期（YYYY-MM-DD）/,
  );
  await page.locator("[data-erd-action=close]").click();
  await page.locator("[data-erd-action=expand]").click();
  assert.equal(await page.locator(".erd-fullscreen").count(), 1);
  await page.locator("[data-erd-action=fit]").click();
  await page.locator("[data-erd-action=plus]").click();
  const beforePan = await page.locator(".erd-world").getAttribute("style");
  const box = await viewport.boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point, id) => ({
        id,
        x: point.x,
        y: point.y,
        radiusX: 3,
        radiusY: 3,
      })),
    });
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch("touchStart", [center]);
  await touch("touchMove", [{ x: center.x + 55, y: center.y + 25 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(300);
  assert.notEqual(
    await page.locator(".erd-world").getAttribute("style"),
    beforePan,
  );
  report.touchPan = true;
  const beforePinch = await page.locator(".erd-zoom-value").innerText();
  await touch("touchStart", [
    { x: center.x - 35, y: center.y },
    { x: center.x + 35, y: center.y },
  ]);
  await touch("touchMove", [
    { x: center.x - 75, y: center.y },
    { x: center.x + 75, y: center.y },
  ]);
  await touch("touchEnd", []);
  await page.waitForTimeout(300);
  assert.notEqual(
    await page.locator(".erd-zoom-value").innerText(),
    beforePinch,
  );
  report.touchPinch = true;
  await page.locator('[data-erd-action="reset"]').click();
  assert.equal(await page.locator(".erd-scope").inputValue(), "1");
  assert.equal(await page.locator(".erd-zoom-value").innerText(), "100%");
  report.reset = true;
  await search.fill("order_items");
  await page.locator(".erd-search-results [data-table=order_items]").click();
  await page.locator(".erd-scope").selectOption("1");
  assert.ok((await page.locator(".erd-node").count()) < 51);
  await page.screenshot({ path: "artifacts/enterprise-audit/erd-mobile.png" });
  assert.equal(await page.evaluate(() => window.onNativeBack()), true);
  assert.equal(await page.locator(".erd-fullscreen").count(), 0);
  // Preview uses the existing inline table flow.
  await page
    .locator(".erd-node[data-table=order_items] [data-erd-action=preview]")
    .click({ force: true });
  await page.locator(".lab-table [aria-expanded=true]").waitFor();
  assert.equal(
    await page.locator(".lab-data-tabs .selected").innerText(),
    "数据表列表",
  );
  assert.match(
    await page.locator(".table-preview:not([hidden])").innerText(),
    /order_item_id/,
  );
  // A personal SQLite dataset uses the same component and never infers FK links from suffixes.
  const SQL = await initSqlJs();
  const personalDb = new SQL.Database();
  personalDb.run('CREATE TABLE parent(a TEXT NOT NULL,b INT NOT NULL,PRIMARY KEY(a,b)) WITHOUT ROWID; CREATE TABLE child(x TEXT,y INT,FOREIGN KEY(x,y) REFERENCES parent(a,b));CREATE TABLE unlinked(customer_id INT,order_id INT);CREATE TABLE "__proto__"("constructor" INTEGER PRIMARY KEY);');
  const personal = personalDb.export();
  personalDb.close();
  await page.evaluate(
    async (bytes) => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("sql-shouji", 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("datasets", "readwrite");
        transaction.objectStore("datasets").put(
          {
            id: "erd-personal",
            name: "ERD测试个人库",
            bytes: new Uint8Array(bytes),
            createdAt: new Date().toISOString(),
          },
          "erd-personal",
        );
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    },
    [...personal],
  );
  await page.goto("http://127.0.0.1:4173/#/lab/erd-personal");
  await page.reload();
  await page.locator("[data-action=labTab][data-arg=数据表]").click();
  await page.locator("[data-action=labDataView][data-arg=erd]").click();
  await page.locator(".erd-node").first().waitFor();
  await page.locator(".erd-scope").selectOption("all");
  assert.equal(await page.locator(".erd-node").count(), 4);
  assert.equal(await page.locator(".erd-relation.foreign").count(), 1);
  assert.equal(await page.locator(".erd-relation.logical").count(), 0);
  assert.equal(
    await page.locator(".erd-node[data-table=unlinked] .erd-key").count(),
    0,
  );
  await page.locator('[data-action="labTab"][data-arg="代码"]').click();
  await page
    .locator("#sql-editor")
    .fill(
      "CREATE TABLE new_child(id INTEGER PRIMARY KEY,a TEXT,b INTEGER,FOREIGN KEY(a,b) REFERENCES parent(a,b));",
    );
  await page.locator('[data-action="runLab"]').click();
  await page
    .locator('[data-action="labTab"][data-arg="结果"].selected')
    .waitFor();
  await page.locator('[data-action="labTab"][data-arg="数据表"]').click();
  await page.locator(".erd-node").first().waitFor();
  await page.locator(".erd-scope").selectOption("all");
  assert.equal(await page.locator(".erd-node").count(), 5);
  assert.equal(await page.locator(".erd-relation.foreign").count(), 2);
  report.personalSchemaRefresh = true;
  for (const width of [320, 360, 390, 430, 975]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      width,
    );
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  report.personalDataset = true;
  report.fullscreen = true;
  report.preview = true;
  report.pass = true;
} finally {
  report.buildHashes = {};
  for (const file of [
    "dist/app.js",
    "dist/sql-worker.js",
    "dist/style.css",
    "dist/databases.json",
  ])
    report.buildHashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  await browser.close();
  await writeFile(
    "artifacts/enterprise-audit/erd-browser.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(
  "Seven live ERDs, field ports, mobile touch pan/pinch, focus, fullscreen, preview and personal import passed.",
);
