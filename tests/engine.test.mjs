import { formatSqlForDisplay } from "../src/sql-format.js";
import test from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { readFile, readdir } from "node:fs/promises";
import {
  initializeFixture,
  query,
  compareResults,
  checkStructure,
  convertSql,
  judgeState,
} from "../src/engine.js";
const SQL = await initSqlJs();
test("dialect conversion preserves literals and comments", () => {
  assert.equal(
    query(
      new SQL.Database(),
      "SELECT 'a/b SIGNED IF START TRANSACTION' AS text",
    ).rows[0][0],
    "a/b SIGNED IF START TRANSACTION",
  );
  assert.equal(
    query(new SQL.Database(), "SELECT 7/2 AS result").rows[0][0],
    3.5,
  );
  assert.throws(() => convertSql("ATTACH DATABASE x AS y"));
});
test("unordered comparison preserves duplicates and null types", () => {
  const actual = { columns: ["x"], rows: [[1], [1], [null]] };
  assert.equal(
    compareResults(
      actual,
      { columns: ["x"], rows: [[null], [1], [1]] },
      "unordered",
    ).pass,
    true,
  );
  assert.equal(
    compareResults(
      actual,
      { columns: ["x"], rows: [[null], [1], [2]] },
      "unordered",
    ).pass,
    false,
  );
  assert.equal(
    compareResults(
      { columns: ["x"], rows: [[0]] },
      { columns: ["x"], rows: [["0"]] },
    ).pass,
    false,
  );
});
test("special syntax validates structure instead of comments", () => {
  assert.equal(
    checkStructure("SELECT 'LIKE' AS x /* LIKE */", [
      { kind: "like_predicate" },
    ]).pass,
    false,
  );
  assert.equal(
    checkStructure("SELECT x FROM t WHERE x LIKE '____'", [
      { kind: "like_predicate" },
    ]).pass,
    true,
  );
});
test("all reference queries execute against their isolated fixtures", async () => {
  const content = JSON.parse(await readFile("dist/content.json"));
  const baseCache = new Map();
  let count = 0;
  let failures = [];
  let unsupported = [];
  for (const q of content.questions) {
    if (["objective_choice", "predict_public_result"].includes(q.executionMode))
      continue;
    const source = q.referenceSolutions[0].mysqlSql;
    const structure = checkStructure(source, q.requiredAstFeatures);
    if (!structure.pass)
      unsupported.push({ id: q.id, message: structure.message });
    for (const entry of q.testFixtures) {
      let fixture = JSON.parse(await readFile("dist/" + entry.path));
      if (fixture.sharedDataPath) {
        fixture = { ...JSON.parse(await readFile("dist/" + fixture.sharedDataPath)), ...fixture };
      }
      try {
        if (q.executionMode === "database_state") {
          const result = judgeState(
            SQL,
            fixture,
            source,
            q.referenceSolutions[0].sqliteSql,
          );
          if (!result.pass) throw Error(result.message);
        } else {
          let base;
          if (fixture.baseDatabase) {
            if (!baseCache.has(fixture.baseDatabase)) {
              baseCache.clear();
              baseCache.set(
                fixture.baseDatabase,
                new Uint8Array(await readFile("dist/" + fixture.baseDatabase)),
              );
            }
            base = baseCache.get(fixture.baseDatabase);
          }
          const db = initializeFixture(SQL, fixture, base);
          try {
            const result = compareResults(
              query(db, formatSqlForDisplay(source), 50000),
              fixture.expected,
              q.orderPolicy,
              q.numericTolerance?.absolute,
            );
            if (!result.pass) throw Error(result.message);
          } finally {
            db.close();
          }
        }
        count++;
      } catch (error) {
        failures.push({ id: q.id, fixture: entry.id, message: error.message });
      }
    }
  }
  const report = { count, failures, unsupported };
  await (
    await import("node:fs/promises")
  ).writeFile(
    "artifacts/engine-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  assert.equal(failures.length, 0);
});

test("SQL formatting preserves literals, templates and query punctuation", () => {
  const sql =
    "SELECT 'a,b; FROM' AS label, SUM(amount) AS total FROM orders WHERE note='x  y' GROUP BY label ORDER BY total DESC";
  const formatted = formatSqlForDisplay(sql);
  assert.match(formatted, /SELECT/);
  assert.match(formatted, /'a,b; FROM'/);
  assert.match(formatted, /'x  y'/);
  assert.match(formatted, /;$/);
  const template = formatSqlForDisplay(
    "SELECT id,{{blank1}} AS note FROM orders ORDER BY id",
  );
  assert.match(template, /\{\{blank1\}\}/);
  assert.match(template, /ORDER BY id/);
});


test("SQL display keeps short queries compact and complex clauses readable", () => {
  assert.equal(formatSqlForDisplay("SELECT column FROM table;"), "SELECT COLUMN\nFROM TABLE;");
  assert.equal(formatSqlForDisplay("SELECT id, category, sales FROM orders;"), "SELECT id, category, sales\nFROM orders;");
  assert.equal(formatSqlForDisplay("SELECT 1; SELECT 2;"), "SELECT 1;\n\nSELECT 2;");
  const complex = formatSqlForDisplay("WITH totals AS (SELECT store_id, SUM(sales) AS total FROM orders GROUP BY store_id) SELECT * FROM totals ORDER BY total DESC");
  assert.match(complex, /\n/);
  assert.match(complex, /FROM orders/);
  const comment = formatSqlForDisplay("SELECT 1 -- keep this comment\nFROM orders");
  assert.match(comment, /-- keep this comment\n/);
  assert.match(formatSqlForDisplay("SELECT 'line1\nline2' AS note"), /'line1\nline2'/);
});
