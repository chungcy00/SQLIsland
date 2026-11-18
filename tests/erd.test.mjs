import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
import { businessErdDictionary } from "../src/erd-dictionary.js";
import { inspectErdSchema } from "../src/erd-schema.js";
const SQL = await initSqlJs();

test("ERD preserves compound keys, SQLite nullability, conditional uniqueness and true dependencies", () => {
  const db = new SQL.Database();
  db.run(`CREATE TABLE parent(a TEXT NOT NULL,b INTEGER NOT NULL,PRIMARY KEY(a,b)) WITHOUT ROWID;
    CREATE TABLE child(x TEXT,y INTEGER,note TEXT,UNIQUE(x,y),FOREIGN KEY(x,y) REFERENCES parent);
    CREATE TABLE mandatory(id INTEGER PRIMARY KEY,a TEXT NOT NULL,b INTEGER NOT NULL,FOREIGN KEY(a,b) REFERENCES parent(a,b));
    CREATE UNIQUE INDEX conditional ON mandatory(a) WHERE b>0;
    CREATE UNIQUE INDEX expression_key ON mandatory(lower(a));
    CREATE TABLE nullable_pk(id TEXT PRIMARY KEY, parent_id TEXT);
    CREATE TABLE staff(id INTEGER PRIMARY KEY, manager INTEGER REFERENCES staff(id));
    CREATE VIEW summary AS WITH child AS (SELECT a,b FROM parent) SELECT * FROM child;
    CREATE VIEW chained AS SELECT * FROM summary;
    CREATE TABLE case_parent(id INTEGER PRIMARY KEY);
    CREATE TABLE case_child(parent_id INTEGER, FOREIGN KEY(PARENT_ID) REFERENCES CASE_PARENT(ID));
    CREATE TABLE "Ä"(id INTEGER PRIMARY KEY);
    CREATE TABLE "ä"(id INTEGER PRIMARY KEY);
    CREATE TABLE unicode_child(x INTEGER REFERENCES "Ä"(id),y INTEGER REFERENCES "ä"(id));`);
  const before = createHash("sha256").update(db.export()).digest("hex");
  const schema = inspectErdSchema(db, {
    tables: {
      nullable_pk: {
        description: "导入数据",
        columns: [
          {
            name: "parent_id",
            logicalRelation: { table: "parent", column: "a" },
            description: "明确声明的逻辑键",
          },
        ],
      },
    },
  });
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  assert.deepEqual(tables.get("parent").primaryKey, ["a", "b"]);
  assert.ok(tables.get("parent").columns.every((column) => !column.nullable));
  assert.equal(tables.get("nullable_pk").columns[0].nullable, true);
  const compound = schema.relations.find(
    (relation) => relation.kind === "foreign" && relation.fromTable === "child",
  );
  assert.deepEqual(compound.fromColumns, ["x", "y"]);
  assert.deepEqual(compound.toColumns, ["a", "b"]);
  assert.equal(compound.fromCardinality, "0..1");
  assert.equal(compound.toCardinality, "0..1");
  const mandatory = schema.relations.find(
    (relation) => relation.fromTable === "mandatory",
  );
  assert.equal(mandatory.fromCardinality, "0..N");
  assert.equal(mandatory.toCardinality, "1");
  assert.equal(
    tables.get("mandatory").indexes.filter((index) => index.unique).length,
    2,
  );
  assert.deepEqual(
    schema.relations
      .filter((relation) => relation.kind === "view")
      .map((relation) => [relation.fromTable, relation.toTable])
      .sort(),
    [
      ["chained", "summary"],
      ["summary", "parent"],
    ],
  );
  assert.equal(
    schema.relations.filter((relation) => relation.kind === "logical").length,
    1,
  );
  assert.equal(
    schema.relations.filter(
      (relation) =>
        relation.fromTable === "nullable_pk" && relation.kind === "foreign",
    ).length,
    0,
  );
  const caseRelation = schema.relations.find(
    (relation) => relation.fromTable === "case_child",
  );
  assert.deepEqual(caseRelation.fromColumns, ["parent_id"]);
  assert.deepEqual(caseRelation.toColumns, ["id"]);
  assert.equal(caseRelation.toTable, "case_parent");
  assert.deepEqual(
    schema.relations
      .filter((relation) => relation.fromTable === "unicode_child")
      .map((relation) => relation.toTable)
      .sort(),
    ["Ä", "ä"].sort(),
  );
  assert.deepEqual(schema.warnings, []);
  assert.equal(createHash("sha256").update(db.export()).digest("hex"), before);
  db.close();
});

test("all seven ERDs match actual SQLite tables, columns, PKs, FK groups and unique indexes without mutation", async () => {
  const report = { pass: true, datasets: [] };
  for (const group of [
    "retail",
    "inventory",
    "ecommerce",
    "finance",
    "hr",
    "procurement",
    "enterprise",
  ]) {
    const dir = `resources/CONTENT/question_resource/databases/${group}`;
    const bytes = await readFile(`${dir}/${group}.sqlite`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const db = new SQL.Database(bytes);
    const dictionary = JSON.parse(await readFile(`${dir}/schema.json`));
    const schema = inspectErdSchema(db, businessErdDictionary(dictionary));
    const objects = db.exec(
      "SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )[0].values;
    assert.deepEqual(
      schema.tables.map((table) => [table.name, table.type]),
      objects,
    );
    let columns = 0,
      foreignKeys = 0,
      uniqueIndexes = 0;
    for (const table of schema.tables) {
      const quoted = '"' + table.name.replace(/"/g, '""') + '"';
      const info = db.exec(`PRAGMA table_xinfo(${quoted})`)[0].values;
      assert.deepEqual(
        table.columns.map((column) => [
          column.name,
          column.type,
          column.primaryKeyOrder,
        ]),
        info.map((row) => [row[1], row[2], row[5]]),
      );
      const keys =
        db.exec(`PRAGMA foreign_key_list(${quoted})`)[0]?.values || [];
      const groups = new Set(keys.map((row) => row[0]));
      assert.equal(table.foreignKeys.length, groups.size);
      for (const key of table.foreignKeys) {
        const raw = keys
          .filter((row) => String(row[0]) === key.id)
          .sort((a, b) => a[1] - b[1]);
        assert.deepEqual(
          key.columns,
          raw.map((row) => row[3]),
        );
        assert.deepEqual(
          key.targetColumns,
          raw.map((row) => row[4]),
        );
      }
      const indexes = db.exec(`PRAGMA index_list(${quoted})`)[0]?.values || [];
      assert.equal(
        table.indexes.filter((index) => index.unique).length,
        indexes.filter((row) => row[2]).length,
      );
      assert.ok(
        table.description,
        `${group} ${table.name} business description`,
      );
      columns += info.length;
      foreignKeys += groups.size;
      uniqueIndexes += indexes.filter((row) => row[2]).length;
    }
    assert.equal(
      schema.relations.filter((relation) => relation.kind === "foreign").length,
      foreignKeys,
    );
    assert.ok(schema.relations.every((relation) => relation.resolved));
    assert.deepEqual(schema.warnings, []);
    assert.equal(
      createHash("sha256")
        .update(await readFile(`${dir}/${group}.sqlite`))
        .digest("hex"),
      hash,
    );
    report.datasets.push({
      id: group + "-v2",
      sha256: hash,
      objects: objects.length,
      columns,
      foreignKeys,
      uniqueIndexes,
      viewDependencies: schema.relations.filter(
        (relation) => relation.kind === "view",
      ).length,
    });
    db.close();
  }
  await writeFile(
    "artifacts/enterprise-audit/erd-metadata.json",
    JSON.stringify(report, null, 2),
  );
});
