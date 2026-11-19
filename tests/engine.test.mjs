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
    if (q.executionMode === "objective_choice")
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
              q.numericTolerance?.exactColumns,
              q.numericTolerance?.columnAbsolute,
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

test("integer output columns reject fractional offsets while derived metrics retain tolerance", () => {
  const expected = { columns: ["product_id", "weighted_price"], rows: [[1, 125]] };
  for (const order of ["ordered", "unordered"]) {
    assert.equal(compareResults(
      { columns: expected.columns, rows: [[1.005, 125]] }, expected,
      order, 0.0100001, ["product_id"],
    ).pass, false);
    assert.equal(compareResults(
      { columns: expected.columns, rows: [[1, 125.005]] }, expected,
      order, 0.0100001, ["product_id"],
    ).pass, true);
    assert.equal(compareResults(
      { columns: expected.columns, rows: [[1, 125.02]] }, expected,
      order, 0.0100001, ["product_id"],
    ).pass, false);
  }
});

test("price tolerance does not relax percentage accuracy", () => {
  const expected = { columns: ["product_id", "weighted_price_cents", "premium_pct"], rows: [[1, 125.12, 10.23]] };
  const priceTolerance = { weighted_price_cents: 0.0100001 };
  assert.equal(compareResults(
    { columns: expected.columns, rows: [[1, 125.13, 10.23]] }, expected,
    "ordered", 1e-6, ["product_id"], priceTolerance,
  ).pass, true);
  assert.equal(compareResults(
    { columns: expected.columns, rows: [[1, 125.12, 10.235]] }, expected,
    "ordered", 1e-6, ["product_id"], priceTolerance,
  ).pass, false);
});

test("direct-column predicates accept negated inequality equivalents and reject arithmetic", () => {
  const rules = [{kind:"sargable_predicate"}];
  assert.equal(checkStructure("SELECT price FROM products WHERE NOT (price<>89)", rules).pass, true);
  assert.equal(checkStructure("SELECT price FROM products WHERE 89=price", rules).pass, true);
  assert.equal(checkStructure("SELECT price FROM products WHERE price+0=89", rules).pass, false);
});

test("flashcard blanks and abbreviated lesson SQL receive multiline formatting", () => {
  const blank = formatSqlForDisplay('SELECT product_id,100.0*stock_value_cents/NULLIF(□,0) AS inventory_pct FROM share_mini');
  assert.match(blank, /□/);
  assert.match(blank, /\nFROM share_mini/);
  const abbreviated = formatSqlForDisplay('WITH totals AS (...) SELECT total / NULLIF(SUM(total) OVER(),0) ...');
  assert.match(abbreviated, /\.\.\./);
  assert.match(abbreviated, /\nSELECT/);
});

test("redesigned business questions match independent fixtures with both solutions", async () => {
  const content = JSON.parse(await readFile("dist/content.json"));
  const redesigned = content.questions.filter(question => question.gradingRevision);
  assert.equal(redesigned.length, 4);
  for (const question of redesigned) {
    let wrongRejected = false;
    let hardcodedRejected = false;
    const publicRows = question.expectedOutput.rows;
    const serialize = value => value === null ? "NULL" :
      typeof value === "number" ? String(value) : "'" + value.replaceAll("'", "''") + "'";
    const hardcoded = publicRows.map(row => "SELECT " + row.map((value, index) =>
      serialize(value) + ' AS "' + question.expectedColumns[index] + '"').join(", ")).join(" UNION ALL ");
    for (const meta of question.testFixtures) {
      const fixture = JSON.parse(await readFile("dist/" + meta.path));
      const shared = fixture.sharedDataPath ? JSON.parse(await readFile("dist/" + fixture.sharedDataPath)) : {};
      const bytes = fixture.baseDatabase ? await readFile("dist/" + fixture.baseDatabase) : undefined;
      const db = initializeFixture(SQL, { ...shared, ...fixture }, bytes);
      const matches = sql => compareResults(query(db, sql, 50000), fixture.expected, "ordered", 1e-6,
        question.numericTolerance.exactColumns).pass;
      try {
        for (const solution of question.referenceSolutions) {
          assert.ok(matches(solution.mysqlSql), question.id + " " + meta.id + " " + solution.kind);
        }
        wrongRejected ||= !matches(question.commonErrors[0].sql);
        if (fixture.visibility === "hidden") hardcodedRejected ||= !matches(hardcoded);
      } finally {
        db.close();
      }
    }
    assert.ok(wrongRejected && hardcodedRejected, question.id);
  }
});

test("course checkpoints match their recorded results in SQLite WASM", async () => {
  const content = JSON.parse(await readFile("dist/content.json"));
  const datasets = JSON.parse(await readFile("dist/databases.json")).datasets;
  let count = 0;
  for (const lesson of content.chapters.flatMap(chapter => chapter.knowledgePoints)) {
    const steps = [...lesson.teaching.checkpoints, ...lesson.teaching.mergeExamples];
    if (!steps.length) continue;
    const dataset = datasets.find(item => item.id === lesson.datasetId);
    const base = dataset ? await readFile("dist/" + dataset.path) : undefined;
    const db = initializeFixture(SQL, { tables: dataset ? [] : lesson.sourceTables }, base);
    try {
      if (lesson.setupSql) db.run(lesson.setupSql);
      for (const step of steps) {
        if (step.sourceTables) {
          const supplemental = initializeFixture(SQL, { tables: step.sourceTables });
          try { assert.ok(compareResults(query(supplemental, step.sql), step.result, "ordered").pass); }
          finally { supplemental.close(); }
          count++;
          continue;
        }
        assert.ok(compareResults(query(db, step.sql), step.result, "ordered").pass,
          lesson.id + " " + (step.name || step.label));
        count++;
      }
    } finally {
      db.close();
    }
  }
  assert.equal(count, 92);
});

test("salary RANGE frames accept both answers and reject ROWS and literal spoofing", async () => {
  const content = JSON.parse(await readFile('dist/content.json'));
  const q = content.questions.find(question => question.id === 'q0212');
  for (const solution of q.referenceSolutions) {
    assert.equal(checkStructure(solution.mysqlSql, q.requiredAstFeatures).pass, true);
    assert.equal(checkStructure(solution.mysqlSql.replace('RANGE BETWEEN', 'ROWS BETWEEN'), q.requiredAstFeatures).pass, false);
  }
  assert.equal(checkStructure("SELECT 'RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW' FROM employees",q.requiredAstFeatures).pass,false);
});
