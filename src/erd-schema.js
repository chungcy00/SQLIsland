import sqliteParser from "node-sql-parser/build/sqlite.js";
const parser = new sqliteParser.Parser();
const sqliteName = (value) =>
  String(value).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const quote = (value) => '"' + String(value).replace(/"/g, '""') + '"';
function read(db, sql) {
  const result = db.exec(sql)[0];
  return result
    ? result.values.map((row) =>
        Object.fromEntries(
          result.columns.map((name, index) => [name, row[index]]),
        ),
      )
    : [];
}
function viewDependencies(sql, names) {
  const dependencies = new Set();
  function visit(node, inherited = new Set()) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, inherited));
      return;
    }
    const scope = new Set(inherited);
    for (const cte of node.with || [])
      scope.add(sqliteName(cte.name?.value || ""));
    for (const source of node.from || []) {
      const table = source.table ? sqliteName(source.table) : null;
      if (table && !scope.has(table) && names.has(table))
        dependencies.add(names.get(table));
    }
    for (const child of Object.values(node)) visit(child, scope);
  }
  visit(parser.astify(sql));
  return [...dependencies];
}
/** Only actual SQLite constraints establish physical relationships. Dictionary links remain logical. */
export function inspectErdSchema(db, dictionary = {}) {
  const objects = read(
    db,
    "SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const names = new Map(
    objects.map((object) => [sqliteName(object.name), object.name]),
  );
  const flags = new Map(
    read(db, "PRAGMA table_list").map((row) => [row.name, row]),
  );
  const warnings = [];
  const tables = objects.map((object) => {
    const metadata =
      dictionary.tables?.[object.name] || dictionary.views?.[object.name] || {};
    const columns = read(db, `PRAGMA table_xinfo(${quote(object.name)})`);
    const indexes =
      object.type === "table"
        ? read(db, `PRAGMA index_list(${quote(object.name)})`).map((index) => ({
            name: index.name,
            unique: !!index.unique,
            partial: !!index.partial,
            origin: index.origin,
            columns: read(db, `PRAGMA index_xinfo(${quote(index.name)})`)
              .filter((column) => column.key)
              .map((column) => column.name),
            sql:
              read(
                db,
                `SELECT sql FROM sqlite_master WHERE type='index' AND name=${"'" + index.name.replace(/'/g, "''") + "'"}`,
              )[0]?.sql || null,
          }))
        : [];
    const primaryKey = columns
      .filter((column) => column.pk)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const integerAlias =
      primaryKey.length === 1 &&
      columns.find((column) => column.pk)?.type.toUpperCase() === "INTEGER" &&
      !indexes.some((index) => index.origin === "pk");
    const foreignKeys = [];
    const groups = new Map();
    for (const key of object.type === "table"
      ? read(db, `PRAGMA foreign_key_list(${quote(object.name)})`)
      : []) {
      if (!groups.has(key.id)) groups.set(key.id, []);
      groups.get(key.id).push(key);
    }
    for (const [id, group] of groups) {
      group.sort((a, b) => a.seq - b.seq);
      foreignKeys.push({
        id: String(id),
        targetTable: names.get(sqliteName(group[0].table)) || group[0].table,
        columns: group.map(
          (key) =>
            columns.find(
              (column) => sqliteName(column.name) === sqliteName(key.from),
            )?.name || key.from,
        ),
        targetColumns: group.map((key) => key.to),
        onUpdate: group[0].on_update,
        onDelete: group[0].on_delete,
        match: group[0].match,
      });
    }
    return {
      name: object.name,
      type: object.type,
      sql: object.sql,
      description: metadata.description || "",
      primaryKey,
      indexes,
      foreignKeys,
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type || "",
        primaryKeyOrder: column.pk,
        nullable: !(
          column.notnull ||
          (column.pk &&
            (integerAlias ||
              flags.get(object.name)?.wr ||
              flags.get(object.name)?.strict))
        ),
        defaultValue: column.dflt_value,
        generated: column.hidden === 2 || column.hidden === 3,
        hidden: column.hidden === 1,
        description:
          metadata.columns?.find((entry) => entry.name === column.name)
            ?.description || "",
      })),
    };
  });
  const byName = new Map(tables.map((table) => [table.name, table]));
  const relations = [];
  const hasUnique = (table, columns) =>
    [
      table.primaryKey,
      ...table.indexes
        .filter(
          (index) =>
            index.unique && !index.partial && index.columns.every(Boolean),
        )
        .map((index) => index.columns),
    ].some(
      (keys) => keys.length > 0 && keys.every((key) => columns.includes(key)),
    );
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const target = byName.get(fk.targetTable);
      const referenced = fk.targetColumns.map((column, index) =>
        column
          ? target?.columns.find(
              (entry) => sqliteName(entry.name) === sqliteName(column),
            )?.name || column
          : target?.primaryKey[index],
      );
      const resolved =
        !!target &&
        referenced.length === fk.columns.length &&
        referenced.every((column) =>
          target.columns.some((entry) => entry.name === column),
        ) &&
        (fk.targetColumns.every(Boolean) ||
          target.primaryKey.length === fk.columns.length);
      const nullable = fk.columns.some(
        (name) =>
          table.columns.find((column) => column.name === name)?.nullable,
      );
      const relation = {
        id: `fk:${table.name}:${fk.id}`,
        kind: "foreign",
        fromTable: table.name,
        toTable: fk.targetTable,
        fromColumns: fk.columns,
        toColumns: referenced,
        fromCardinality: hasUnique(table, fk.columns) ? "0..1" : "0..N",
        toCardinality: nullable ? "0..1" : "1",
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
        resolved,
      };
      relations.push(relation);
      if (!resolved)
        warnings.push(
          `${table.name} 的外键目标 ${fk.targetTable} 无法完整解析`,
        );
    }
    if (table.type === "view") {
      try {
        for (const dependency of viewDependencies(table.sql, names))
          relations.push({
            id: `view:${table.name}:${dependency}`,
            kind: "view",
            fromTable: table.name,
            toTable: dependency,
            fromColumns: [],
            toColumns: [],
            resolved: true,
          });
      } catch {
        warnings.push(`视图 ${table.name} 的依赖语法尚未解析`);
      }
    }
  }
  const declared = [...(dictionary.relationships || [])];
  for (const [name, table] of Object.entries(dictionary.tables || {})) {
    for (const column of table.columns || []) {
      const link = column.logicalRelation || column.foreignKey;
      if (link?.table && link?.column)
        declared.push({
          fromTable: name,
          fromColumns: [column.name],
          toTable: link.table,
          toColumns: [link.column],
        });
    }
  }
  for (const link of declared) {
    const from = byName.get(link.fromTable),
      to = byName.get(link.toTable);
    if (
      !from ||
      !to ||
      !link.fromColumns?.length ||
      link.fromColumns.length !== link.toColumns?.length
    )
      continue;
    if (
      !link.fromColumns.every((name) =>
        from.columns.some((column) => column.name === name),
      ) ||
      !link.toColumns.every((name) =>
        to.columns.some((column) => column.name === name),
      )
    )
      continue;
    if (
      relations.some(
        (relation) =>
          relation.kind === "foreign" &&
          relation.fromTable === from.name &&
          relation.toTable === to.name &&
          link.fromColumns.every(
            (name, index) =>
              relation.fromColumns.includes(name) &&
              relation.toColumns[relation.fromColumns.indexOf(name)] ===
                link.toColumns[index],
          ),
      )
    )
      continue;
    relations.push({
      id: `logical:${from.name}:${relations.length}`,
      kind: "logical",
      fromTable: from.name,
      toTable: to.name,
      fromColumns: link.fromColumns,
      toColumns: link.toColumns,
      resolved: true,
      description: link.description || "数据字典声明的逻辑关联",
    });
  }
  return { tables, relations, warnings };
}
