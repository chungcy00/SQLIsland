// 闪卡教学图示核对：函数卡“输入 → 函数 → 输出”里的每个值，必须与示例在应用执行层的实际结果一致（不虚构数据）。纯 Node，无需浏览器。
import initSqlJs from "sql.js";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { initializeFixture, query } from "../src/engine.js";
import { normalizeCards } from "../src/flashcard-model.mjs";
import { callPairs, FIGURE_UNVERIFIABLE } from "../src/flashcard-blocks.mjs";
const SQL = await initSqlJs();
const source = JSON.parse(await readFile("resources/CONTENT/flashcard_v2/cards.json", "utf8"));
const map = JSON.parse(await readFile("resources/CONTENT/flashcard_v2/illustration-map.json", "utf8"));
const cards = normalizeCards(source, map);
const bad = [];
// 名单里的卡必须真的无法在本地执行（否则应移出名单）
for (const id of FIGURE_UNVERIFIABLE) {
  const card = cards.find((c) => c.id === id);
  const ex = (card.examples?.length ? card.examples : [card.example])[0];
  let ok = false;
  for (const sql of [ex.sqliteSql, ex.sql, ex.mysqlSql].filter(Boolean)) { try { const db = initializeFixture(SQL, { setupSql: ex.setupSql }); try { query(db, sql, 100); ok = true; } finally { db.close(); } } catch {} }
  if (ok) bad.push(`${id} 在本地其实能执行，应移出 FIGURE_UNVERIFIABLE`);
}
let checked = 0, figures = 0;
const same = (a, b) => (a === b) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);
for (const card of cards.filter((c) => c.type === "function")) {
  const found = callPairs(card);
  if (!found) continue;
  figures++;
  const ex = found.example;
  const candidates = [ex.sqliteSql, ex.sql, ex.mysqlSql].filter(Boolean);
  let ran = null;
  for (const sql of candidates) {
    try {
      const db = initializeFixture(SQL, { setupSql: ex.setupSql }, undefined);
      try { const r = query(db, sql, 100); if (r.rows.length === 1 && r.columns.length === ex.expected.columns.length) { ran = r; break; } } finally { db.close(); }
    } catch { /* 该写法本地不能执行，换下一种 */ }
  }
  if (!ran) { bad.push(`${card.id}: 没有任何写法能在本地执行出单行结果`); continue; }
  found.pairs.forEach((p, i) => { checked++; if (!same(ran.rows[0][i], p.value)) bad.push(`${card.id} ${p.expr}: 图示 ${JSON.stringify(p.value)} ≠ 实际 ${JSON.stringify(ran.rows[0][i])}`); });
}
console.log(`函数卡图示 ${figures} 张，核对 ${checked} 个“调用 → 结果”`);
if (bad.length) { console.log(bad.join("\n")); }
assert.deepEqual(bad, []);
console.log("Flashcard figures match actual execution.");
