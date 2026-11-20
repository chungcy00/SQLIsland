// 闪卡“示例数据”：用应用的执行层运行每个示例的 setupSql，取出它建出来的表（构建时计算，只写入打包副本，不改原始数据）。
import initSqlJs from "sql.js";
import { initializeFixture } from "../src/engine.js";
const SQL = await initSqlJs();
const hasDataSection = (card) => (card.back?.sections || []).some((s) => s.type === "table" && /数据示例|原始数据/.test(s.title || ""));
export const needsDataSets = (card) => !hasDataSection(card);
export function dataSetsOf(card) {
  const examples = (Array.isArray(card.examples) && card.examples.length ? card.examples : card.example ? [card.example] : []).filter((x) => x && typeof x.setupSql === "string" && x.setupSql.trim());
  const groups = new Map();
  for (const ex of examples) {
    if (!groups.has(ex.setupSql)) groups.set(ex.setupSql, []);
    if (ex.label) groups.get(ex.setupSql).push(ex.label);
  }
  const sets = [];
  for (const [setup, labels] of groups) {
    let db;
    try {
      db = initializeFixture(SQL, { setupSql: setup });
      const names = (db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid")[0]?.values || []).map((v) => v[0]);
      const tables = names.map((name) => {
        const r = db.exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`)[0];
        const info = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`)[0]?.values.map((v) => v[1]) || [];
        const rows = r ? r.values : [];
        return { name, columns: r ? r.columns : info, rows: rows.slice(0, 30), rowCount: rows.length };
      }).filter((t) => t.columns.length);
      if (tables.length) sets.push({ labels, tables });
    } catch { /* 该 setupSql 本地无法执行：不显示数据 */ } finally { db?.close(); }
  }
  return sets;
}
export function addDataSets(cards) {
  return cards.map((card) => {
    if (!needsDataSets(card)) return card;
    const dataSets = dataSetsOf(card);
    return dataSets.length ? { ...card, dataSets } : card;
  });
}
