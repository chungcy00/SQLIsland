import parserModule from "node-sql-parser/build/mysql.js";
import windowParserModule from "node-sql-parser/build/bigquery.js";
const windowParser = new windowParserModule.Parser();
const parser = new parserModule.Parser();
const quoted = (s) => '"' + String(s).replace(/"/g, '""') + '"';

// Keep quoted literals and comments intact during dialect conversion.
export function tokens(sql) {
  const result = [];
  const pattern =
    /('(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][\w$]*|\s+|.)/g;
  for (const match of sql.matchAll(pattern)) {
    const value = match[0];
    result.push({
      value,
      type: /^['"`]/.test(value)
        ? "quoted"
        : /^(--|#|\/\*)/.test(value)
          ? "comment"
          : /^\s+$/.test(value)
            ? "space"
            : "code",
    });
  }
  return result;
}
export function convertSql(sql) {
  const list = tokens(sql);
  const code = list
    .filter((t) => t.type === "code")
    .map((t) => t.value.toUpperCase());
  for (const forbidden of [
    "ATTACH",
    "DETACH",
    "PRAGMA",
    "VACUUM",
    "LOAD_EXTENSION",
    "INSTALL",
    "LOAD",
    "INTO OUTFILE",
  ]) {
    if (code.includes(forbidden))
      throw new Error("本地执行不支持管理、文件访问或外部扩展语句。");
  }
  if (
    code.includes("DIV") ||
    code.includes("INTERVAL") ||
    code.includes("PROCEDURE") ||
    code.includes("TRIGGER")
  ) {
    throw new Error("该语法暂未接入本地兼容执行，请查看课程中的 MySQL 说明。");
  }
  const converted = list
    .map((t) => {
      if (t.type === "comment")
        return t.value.startsWith("#") ? "--" + t.value.slice(1) : t.value;
      if (t.type !== "code") return t.value;
      if (t.value === "/") return "*1.0/";
      if (t.value.toUpperCase() === "SIGNED") return "INTEGER";
      if (t.value.toUpperCase() === "IF") return "IIF";
      return t.value;
    })
    .join("");
  // Only replace a complete statement outside literals.
  return splitStatements(converted)
    .map((s) => {
      const words = tokens(s)
        .filter((t) => t.type === "code")
        .map((t) => t.value.toUpperCase());
      return words.join(" ") === "START TRANSACTION" ? "BEGIN TRANSACTION" : s;
    })
    .join(";");
}
export function splitStatements(sql) {
  const parts = [];
  let current = "";
  for (const token of tokens(sql)) {
    if (token.type === "code" && token.value === ";") {
      if (current.trim()) parts.push(current);
      current = "";
    } else current += token.value;
  }
  if (current.trim()) parts.push(current);
  return parts;
}
export function registerFunctions(db) {
  db.create_function("CONCAT", (...args) =>
    args.some((v) => v === null) ? null : args.join(""),
  );
  db.create_function("CHAR_LENGTH", (v) =>
    v === null ? null : Array.from(String(v)).length,
  );
  db.create_function("OCTET_LENGTH", (v) =>
    v === null ? null : new TextEncoder().encode(String(v)).length,
  );
  db.create_function("YEAR", (v) =>
    v === null ? null : Number(String(v).slice(0, 4)),
  );
  db.create_function("MONTH", (v) =>
    v === null ? null : Number(String(v).slice(5, 7)),
  );
  db.create_function("DATEDIFF", (a, b) =>
    a === null || b === null
      ? null
      : Math.round(
          (Date.parse(String(a).slice(0, 10) + "T00:00:00Z") -
            Date.parse(String(b).slice(0, 10) + "T00:00:00Z")) /
            86400000,
        ),
  );
  db.create_function("DATE_FORMAT", (value, format) => {
    if (value === null || format === null) return null;
    const d = String(value);
    const map = {
      "%Y": d.slice(0, 4),
      "%m": d.slice(5, 7),
      "%d": d.slice(8, 10),
      "%%": "%",
    };
    if (/%(?![Ymd%])/.test(format))
      throw new Error("DATE_FORMAT 当前支持 %Y、%m、%d。");
    return String(format).replace(/%[Ymd%]/g, (m) => map[m]);
  });
  db.create_function("FLOOR", (v) => (v === null ? null : Math.floor(v)));
  db.create_function("CEIL", (v) => (v === null ? null : Math.ceil(v)));
}
export function initializeFixture(SQL, fixture, base) {
  const db = base ? new SQL.Database(base) : new SQL.Database();
  registerFunctions(db);
  db.run("PRAGMA foreign_keys=ON");
  if (fixture.setupSql) db.run(fixture.setupSql);
  for (const table of fixture.tables || []) {
    db.run(
      `CREATE TABLE ${quoted(table.name)} (${table.columns.map((c) => `${quoted(c.name)} ${c.sqliteType || c.type}`).join(",")})`,
    );
    const insert = db.prepare(
      `INSERT INTO ${quoted(table.name)} VALUES (${table.columns.map(() => "?").join(",")})`,
    );
    try {
      for (const row of table.rows) insert.run(row);
    } finally {
      insert.free();
    }
  }
  for (const patch of fixture.patchSql || []) db.run(patch);
  return db;
}
export function query(db, sql, maxRows = 10000) {
  const statements = splitStatements(convertSql(sql));
  if (!statements.length) throw new Error("请先输入 SQL。");
  let result = { columns: [], rows: [], rowCount: 0 };
  for (const statement of statements) {
    const stmt = db.prepare(statement);
    try {
      const columns = stmt.getColumnNames();
      const rows = [];
      while (stmt.step()) {
        if (rows.length >= maxRows)
          throw new Error(`结果超过 ${maxRows} 行，请添加筛选或 LIMIT。`);
        rows.push(stmt.get());
      }
      result = { columns, rows, rowCount: rows.length };
    } finally {
      stmt.free();
    }
  }
  return result;
}
export function compareResults(
  actual,
  expected,
  policy = "ordered",
  tolerance = 1e-6,
  exactColumns = [],
  columnTolerances = {},
) {
  if (JSON.stringify(actual.columns) !== JSON.stringify(expected.columns))
    return { pass: false, message: "输出列名或列顺序与题目要求不同。" };
  if (actual.rows.length !== expected.rows.length)
    return {
      pass: false,
      message: `返回 ${actual.rows.length} 行，预期 ${expected.rows.length} 行。`,
    };
  const integerColumns = new Set(exactColumns);
  const cell = (a, b, index) => {
    if (typeof a !== typeof b) return false;
    if (typeof a !== "number") return a === b;
    if (integerColumns.has(expected.columns[index])) {
      return Number.isInteger(a) && Number.isInteger(b) && a === b;
    }
    if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
    const allowedDifference = columnTolerances[expected.columns[index]] ?? tolerance;
    return Math.abs(a - b) <= allowedDifference;
  };
  const row = (a, b) =>
    a.length === b.length && a.every((v, i) => cell(v, b[i], i));
  if (policy === "ordered")
    return actual.rows.every((r, i) => row(r, expected.rows[i]))
      ? { pass: true }
      : {
          pass: false,
          message: "结果值或行顺序不同，请检查排序、NULL 和重复记录。",
        };
  // Augmenting-path matching preserves duplicate rows with numeric tolerance.
  const match = new Array(expected.rows.length).fill(-1);
  function assign(i, seen) {
    for (let j = 0; j < expected.rows.length; j++)
      if (!seen[j] && row(actual.rows[i], expected.rows[j])) {
        seen[j] = true;
        if (match[j] === -1 || assign(match[j], seen)) {
          match[j] = i;
          return true;
        }
      }
    return false;
  }
  return actual.rows.every((_, i) =>
    assign(i, new Array(match.length).fill(false)),
  )
    ? { pass: true }
    : { pass: false, message: "结果值不同，请检查 NULL、重复行和数值精度。" };
}
function walk(value, fn) {
  if (!value || typeof value !== "object") return;
  fn(value);
  for (const child of Object.values(value))
    if (typeof child === "object") walk(child, fn);
}
function checkRangeFrame(sql) {
  let ast;
  try {
    ast = windowParser.astify(sql, { database: "BigQuery" });
  } catch {
    return { pass: false, unsupported: true, message: "该写法的窗口结构暂无法解析。" };
  }
  const nodes = [];
  walk(ast, node => nodes.push(node));
  const windows = new Map(nodes.filter(node => node.name && node.as_window_specification)
    .map(node => [node.name, node.as_window_specification.window_specification]));
  const pass = nodes.some(node => {
    if (node.type !== "aggr_func" || node.name?.toUpperCase() !== "SUM" || !node.over) return false;
    const definition = node.over.as_window_specification;
    const specification = typeof definition === "string" ? windows.get(definition) : definition?.window_specification;
    const frame = specification?.window_frame_clause;
    const column = node.args?.expr?.column?.expr?.value;
    const ordering = specification?.orderby;
    return column === "salary" && ordering?.length === 1 &&
      ordering[0].expr?.column?.expr?.value === "salary" && ordering[0].type !== "DESC" &&
      !specification.partitionby?.length &&
      frame?.left?.value?.toUpperCase() === "RANGE" &&
      frame.right?.value?.[0]?.value?.toUpperCase() === "UNBOUNDED PRECEDING" &&
      frame.right?.value?.[1]?.value?.toUpperCase() === "CURRENT ROW";
  });
  return { pass, message: pass ? undefined : "请按薪资升序使用 RANGE 从开头累计到当前值。" };
}
export function checkStructure(sql, required = []) {
  if (required.length === 1 && required[0].kind === "range_frame") return checkRangeFrame(sql);
  let ast;
  try {
    ast = parser.astify(sql, { database: "MySQL" });
  } catch {
    if (required.length)
      return {
        pass: false,
        unsupported: true,
        message: "该写法的专项结构验证暂不支持，本次保留为未评定。",
      };
    return { pass: true };
  }
  const nodes = [];
  walk(ast, (n) => nodes.push(n));
  const func = (name) =>
    nodes.some(
      (n) =>
        (n.type === "function" &&
          JSON.stringify(n.name).toUpperCase().includes(name)) ||
        (n.type === "aggr_func" && n.name?.toUpperCase() === name),
    );
  for (const rule of required) {
    let valid = false;
    switch (rule.kind) {
      case "like_predicate":
        valid = nodes.some(
          (n) => n.type === "binary_expr" && n.operator === "LIKE",
        );
        break;
      case "concat_call":
        valid = func("CONCAT");
        break;
      case "recursive_cte":
        valid = nodes.some((n) => n.recursive === true);
        break;
      case "cte_high_products":
      case "cte_jan":
        valid = nodes.some((n) =>
          n.with?.some((c) => c.name.value === rule.kind.slice(4)),
        );
        break;
      case "dense_rank_window":
        valid = func("DENSE_RANK") && nodes.some((n) => n.over);
        break;
      case "sargable_predicate": {
        const predicates = [];
        walk(ast, (n) => {
          if (n.where)
            walk(n.where, (x) => {
              if (
                x.type === "binary_expr" &&
                ["=", "<>", "!=", ">=", ">", "<", "<=", "BETWEEN"].includes(x.operator)
              )
                predicates.push(x);
            });
        });
        valid =
          predicates.length > 0 &&
          predicates.every(
            (n) =>
              n.left.type === "column_ref" || n.right?.type === "column_ref",
          );
        break;
      }
      default:
        return {
          pass: false,
          unsupported: true,
          message: "该专项结构或事务轨迹验证尚未完成，已保留代码供学习参考。",
        };
    }
    if (!valid)
      return {
        pass: false,
        message:
          "结果需同时满足题目指定的语法结构。" + (rule.requirement || ""),
      };
  }
  // Conservative check. Functional dependencies are intentionally reported as a local limitation.
  for (const select of nodes.filter((n) => n.type === "select" && n.groupby)) {
    const keys = select.groupby.columns || [];
    const keyNames = keys
      .filter((n) => n.type === "column_ref")
      .map((n) => n.column);
    for (const col of select.columns || []) {
      if (col.expr.type === "column_ref" && !keyNames.includes(col.expr.column))
        return {
          pass: false,
          unsupported: true,
          message:
            "本地严格分组检查无法确认该列的函数依赖，请将其加入 GROUP BY 或聚合表达式。",
        };
    }
  }
  return { pass: true };
}
function snapshot(db) {
  const tables = {};
  const names =
    db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )[0]?.values || [];
  for (const [name] of names) {
    const schema =
      db.exec(`PRAGMA table_info(${quoted(name)})`)[0]?.values || [];
    const rows = db.exec(`SELECT * FROM ${quoted(name)}`)[0]?.values || [];
    const indexes = (
      db.exec(`PRAGMA index_list(${quoted(name)})`)[0]?.values || []
    )
      .map((r) => ({
        unique: r[2],
        origin: r[3],
        partial: r[4],
        keys: db
          .exec(`PRAGMA index_info(${quoted(r[1])})`)[0]
          ?.values.map((v) => v[2]),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    tables[name] = {
      columns: schema.map((r) => r.slice(1)),
      foreignKeys:
        db.exec(`PRAGMA foreign_key_list(${quoted(name)})`)[0]?.values || [],
      indexes,
      rows: rows.sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    };
  }
  return tables;
}
export function judgeState(SQL, fixture, sql, reference) {
  const user = initializeFixture(SQL, fixture);
  const expected = initializeFixture(SQL, fixture);
  try {
    query(user, sql);
    query(expected, reference);
    if (JSON.stringify(snapshot(user)) !== JSON.stringify(snapshot(expected)))
      return {
        pass: false,
        message: "执行后的数据、字段或约束与参考状态不同。",
      };
    // An open transaction cannot create a new transaction.
    try {
      user.run("BEGIN");
      user.run("ROLLBACK");
    } catch {
      return {
        pass: false,
        message: "事务尚未结束，请检查 COMMIT 或 ROLLBACK。",
      };
    }
    for (const probe of fixture.probes || []) {
      const backup = user.export();
      const probeDb = new SQL.Database(backup);
      registerFunctions(probeDb);
      probeDb.run("PRAGMA foreign_keys=ON");
      let rejected = false;
      let observed;
      try {
        probeDb.run(probe.sql);
        if (probe.observe) observed = query(probeDb, probe.observe);
      } catch {
        rejected = true;
      } finally {
        probeDb.close();
      }
      if (rejected !== probe.mustReject)
        return {
          pass: false,
          message: "约束边界检查未通过，请检查主键、外键、NOT NULL 或 CHECK。",
        };
      if (probe.observe && !rejected) {
        const temp = new SQL.Database(expected.export());
        registerFunctions(temp);
        try {
          temp.run(probe.sql);
          if (!compareResults(observed, query(temp, probe.observe)).pass)
            return { pass: false, message: "默认值行为与要求不同。" };
        } finally {
          temp.close();
        }
      }
    }
    return { pass: true };
  } finally {
    user.close();
    expected.close();
  }
}
