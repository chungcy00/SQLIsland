import initSqlJs from "sql.js";
import { inspectErdSchema } from "./erd-schema.js";
import {
  initializeFixture,
  registerFunctions,
  query,
  compareResults,
  checkStructure,
  judgeState,
  tokens,
  splitStatements,
} from "./engine.js";
let SQL;
let lab;
let labGeneration = 0;
async function load() {
  if (!SQL)
    SQL = await initSqlJs({
      locateFile: () => new URL("sql-wasm.wasm", self.location.href).href,
    });
}
async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("缺少本地资源 " + path);
  const fixture = await response.json();
  if (fixture.sharedDataPath) {
    const shared = await fetch(fixture.sharedDataPath);
    if (!shared.ok)
      throw new Error("缺少本地测试场景 " + fixture.sharedDataPath);
    return { ...(await shared.json()), ...fixture };
  }
  return fixture;
}
async function bytes(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("缺少数据库 " + path);
  return new Uint8Array(await response.arrayBuffer());
}
function labSchema(db) {
  const tables =
    db.exec(
      "SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )[0]?.values || [];
  const fields = tables.map(([name]) => ({
    name,
    columns: (
      db.exec('PRAGMA table_info("' + name.replace(/"/g, '""') + '")')[0]
        ?.values || []
    ).map((row) => ({ name: row[1], type: row[2], primaryKey: row[5] > 0 })),
  }));
  return { tables, fields };
}
self.onmessage = async ({ data }) => {
  const { id, action, payload } = data;
  try {
    await load();
    let result;
    if (action === "selftest")
      result = {
        ...query(new SQL.Database(), "SELECT 2+3 AS result"),
        version: new SQL.Database().exec("SELECT sqlite_version()")[0]
          .values[0][0],
      };
    if (action === "lesson") {
      const db = initializeFixture(SQL, { tables: payload.tables });
      try {
        result = query(db, payload.sql);
      } finally {
        db.close();
      }
    }
    if (action === "exercise") {
      const { question: q, sql, submit } = payload;
      if (q.executionMode === "predict_public_result")
        throw new Error("结果预测题请手工填写结果后提交。");
      const structure = checkStructure(
        sql,
        submit ? q.requiredAstFeatures : [],
      );
      if (!structure.pass) {
        result = structure;
      } else {
        const fixtures = submit
          ? q.testFixtures
          : q.testFixtures.filter((f) => f.visibility === "public").slice(0, 1);
        let display;
        let completed = 0;
        for (const entry of fixtures) {
          const fixture = await readJson(entry.path);
          if (q.executionMode === "database_state") {
            result = judgeState(
              SQL,
              fixture,
              sql,
              q.referenceSolutions[0].sqliteSql,
            );
          } else {
            const db = initializeFixture(
              SQL,
              fixture,
              fixture.baseDatabase
                ? await bytes(fixture.baseDatabase)
                : undefined,
            );
            try {
              const actual = query(db, sql, 50000);
              if (!display) display = actual;
              result = submit
                ? compareResults(
                    actual,
                    fixture.expected,
                    q.orderPolicy,
                    q.numericTolerance?.absolute,
                    q.numericTolerance?.exactColumns,
                  )
                : { pass: true };
            } finally {
              db.close();
            }
          }
          completed++;
          if (!result.pass) break;
        }
        result = {
          ...result,
          result: display,
          fixtures: completed,
          submitted: submit,
        };
      }
    }
    if (action === "labOpen") {
      const generation = ++labGeneration;
      const source = payload.path ? await bytes(payload.path) : payload.bytes;
      const opened = source
        ? new SQL.Database(source)
        : initializeFixture(SQL, { tables: payload.tables });
      if (generation !== labGeneration) {
        opened.close();
        throw new Error("数据库切换已取消");
      }
      if (lab) lab.close();
      lab = opened;
      registerFunctions(lab);
      lab.run("PRAGMA foreign_keys=ON");
      result = labSchema(lab);
    }
    if (action === "fixtureSchema") {
      const fixture = payload.fixture;
      const db = initializeFixture(
        SQL,
        fixture,
        fixture.baseDatabase ? await bytes(fixture.baseDatabase) : undefined,
      );
      try {
        result = labSchema(db);
      } finally {
        db.close();
      }
    }
    if (action === "labSchema") result = labSchema(lab);
    if (action === "labErd") {
      if (!lab) throw new Error("请先选择数据集。");
      result = inspectErdSchema(lab, payload.dictionary);
    }
    if (action === "labQuery") {
      if (!lab) throw new Error("请先选择数据集。");
      const copy = new SQL.Database(lab.export());
      registerFunctions(copy);
      copy.run("PRAGMA foreign_keys=ON");
      try {
        result = query(copy, payload.sql);
        if (payload.writable) {
          lab.close();
          lab = copy;
          result.bytes = lab.export();
        } else copy.close();
      } catch (e) {
        copy.close();
        throw e;
      }
    }
    if (action === "import") {
      const data = payload.data;
      let temp;
      try {
        if (data.bytes) {
          temp = new SQL.Database(data.bytes);
          temp.exec("PRAGMA integrity_check");
        } else if (data.sql) {
          for (const statement of splitStatements(data.sql)) {
            const words = tokens(statement)
              .filter((t) => t.type === "code")
              .map((t) => t.value.toUpperCase());
            if (
              !["CREATE", "INSERT"].includes(words[0]) ||
              (words[0] === "CREATE" && words[1] !== "TABLE")
            )
              throw new Error("SQL 导入仅支持 CREATE TABLE 和 INSERT。");
          }
          temp = new SQL.Database();
          query(temp, data.sql);
        } else {
          temp = initializeFixture(SQL, {
            tables: [
              {
                name: "imported_data",
                columns: data.columns.map((name, i) => ({
                  name,
                  type: data.rows.every(
                    (r) => r[i] === null || typeof r[i] === "number",
                  )
                    ? "NUMERIC"
                    : "TEXT",
                })),
                rows: data.rows,
              },
            ],
          });
        }
        result = { bytes: temp.export() };
      } finally {
        temp?.close();
      }
    }
    if (action === "labExport") {
      if (!lab) throw new Error("请先打开数据集");
      result = { bytes: lab.export() };
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
