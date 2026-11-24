// 面试刷题 98 题：用应用自己的执行层与判题函数核对。
// ① 参考答案在每个夹具上（公开+隐藏）通过判题；② 结构完整；③ 判题不是“凭空通过”：
//    把结果改动一行后必须被拒绝（对有结果行的夹具）；④ 课文知识点存在。
import assert from "node:assert/strict";
import fs from "node:fs";
import initSqlJs from "sql.js";
import { initializeFixture, query, compareResults, judgeState, checkStructure } from "../src/engine.js";

const SQL = await initSqlJs();
const root = "resources/CONTENT/interview_resource/";
const data = JSON.parse(fs.readFileSync(root + "questions.json", "utf8"));
const questions = data.questions;
assert.equal(questions.length, 98);
assert.equal(new Set(questions.map((q) => q.id)).size, 98);

const kps = new Set();
for (const f of fs.readdirSync("resources/CONTENT/courses_resource/courses")) {
  if (!/^ch\d\d\.json$/.test(f)) continue;
  for (const kp of JSON.parse(fs.readFileSync("resources/CONTENT/courses_resource/courses/" + f, "utf8")).knowledgePoints) kps.add(kp.id);
}

let fixtureCount = 0, mutationChecked = 0;
for (const q of questions) {
  assert.match(q.id, /^i\d{3}$/);
  assert.equal(q.chapterId, "interview");
  assert.ok(q.hints.length >= 1 && q.explanation && q.requirements && q.title, q.id);
  assert.ok(q.testFixtures.some((f) => f.visibility === "public"), q.id + " 缺公开夹具");
  assert.ok(q.testFixtures.some((f) => f.visibility === "hidden"), q.id + " 缺隐藏夹具");
  for (const id of q.knowledgePointIds) assert.ok(kps.has(id), `${q.id} 课文 ${id} 不存在`);
  assert.equal(checkStructure(q.referenceSolutions[0].mysqlSql, q.requiredAstFeatures).pass, true, q.id);
  for (const entry of q.testFixtures) {
    const fixture = JSON.parse(fs.readFileSync(root + entry.path, "utf8"));
    fixtureCount++;
    if (q.executionMode === "database_state") {
      const result = judgeState(SQL, fixture, q.referenceSolutions[0].sqliteSql, q.referenceSolutions[0].sqliteSql);
      assert.equal(result.pass, true, `${q.id} ${entry.id} ${result.message}`);
      // 独立期望：执行后目标表的行必须等于源数据给出的期望（多重集合）
      const db = initializeFixture(SQL, fixture);
      try {
        query(db, q.referenceSolutions[0].sqliteSql);
        const t = fixture.expectedTable;
        const actual = query(db, `SELECT ${t.columns.map((c) => `"${c}"`).join(",")} FROM "${t.name}"`);
        assert.equal(compareResults(actual, { columns: t.columns, rows: t.rows }, "unordered_multiset").pass, true, `${q.id} ${entry.id} 表状态与期望不同`);
      } finally { db.close(); }
      // 不执行任何语句必须被判为不通过（DML 题的参考结果与初始状态不同）
      if (entry.visibility === "public") {
        const noop = judgeState(SQL, fixture, "SELECT 1", q.referenceSolutions[0].sqliteSql);
        assert.equal(noop.pass, false, `${q.id} 未做修改却通过`);
        mutationChecked++;
      }
      continue;
    }
    const db = initializeFixture(SQL, fixture);
    try {
      const actual = query(db, q.referenceSolutions[0].mysqlSql, 50000);
      const result = compareResults(actual, fixture.expected, q.orderPolicy, q.numericTolerance.absolute, q.numericTolerance.exactColumns);
      assert.equal(result.pass, true, `${q.id} ${entry.id}: ${result.message}`);
      // 变异：改动第一行第一个单元格后必须被拒绝；多出一行也必须被拒绝
      if (actual.rows.length) {
        const changed = structuredClone(actual);
        const v = changed.rows[0][0];
        changed.rows[0][0] = typeof v === "number" ? v + 1 : v === null ? "x" : String(v) + "x";
        assert.equal(compareResults(changed, fixture.expected, q.orderPolicy, q.numericTolerance.absolute).pass, false, `${q.id} ${entry.id} 改值未被拒绝`);
        const extra = structuredClone(actual);
        extra.rows.push(extra.rows[0]);
        assert.equal(compareResults(extra, fixture.expected, q.orderPolicy, q.numericTolerance.absolute).pass, false, `${q.id} ${entry.id} 多行未被拒绝`);
        mutationChecked++;
      }
    } finally { db.close(); }
  }
}
console.log(`面试题 ${questions.length} 道、夹具 ${fixtureCount} 个：参考答案全部通过；变异拒绝检查 ${mutationChecked} 项`);
