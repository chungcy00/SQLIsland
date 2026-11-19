// 答题差异：仅按“公开结果表”前端逐行对照，只作展示，不参与判题。
export function diffComparison(cmp, q) {
  const a = cmp.actual, x = cmp.expected;
  const tolerance = Number(q?.numericTolerance?.absolute) || 0;
  const norm = (v) => (v === null || v === undefined ? null : typeof v === "number" ? String(tolerance ? Number((Math.round(v / tolerance) * tolerance).toFixed(10)) : v) : v);
  const key = (row) => JSON.stringify(row.map(norm));
  const columnsSame = JSON.stringify(a.columns) === JSON.stringify(x.columns);
  const pool = new Map();
  a.rows.forEach((row, i) => { const k = key(row); (pool.get(k) || pool.set(k, []).get(k)).push(i); });
  const missing = [], matchedActual = new Set(), actualIndexOf = new Map();
  x.rows.forEach((row, i) => {
    const list = pool.get(key(row));
    if (list?.length) { const idx = list.shift(); matchedActual.add(idx); actualIndexOf.set(i, idx); } else missing.push(i);
  });
  const extra = a.rows.map((_, i) => i).filter((i) => !matchedActual.has(i));
  const rows = [];
  const pairedExtra = new Map();
  if (columnsSame) missing.forEach((m, n) => { if (extra[n] !== undefined) pairedExtra.set(m, extra[n]); });
  const usedExtra = new Set(pairedExtra.values());
  x.rows.forEach((row, i) => {
    if (!missing.includes(i)) return rows.push({ mark: "", cells: row, bad: [], actualIndex: actualIndexOf.get(i) });
    rows.push({ mark: "缺", cells: row, bad: [] });
    if (pairedExtra.has(i)) {
      const other = a.rows[pairedExtra.get(i)];
      rows.push({ mark: "多", cells: other, bad: other.map((v, c) => (key([v]) !== key([row[c]]) ? c : -1)).filter((c) => c >= 0) });
    }
  });
  extra.filter((i) => !usedExtra.has(i)).forEach((i) => rows.push({ mark: "多", cells: a.rows[i], bad: [] }));
  // 有缺/多行时，已匹配的行若相对顺序与预期不同，同样标“序”（仅有序题）
  if (q?.orderPolicy === "ordered" && (missing.length || extra.length)) {
    const matched = rows.filter((r) => r.actualIndex !== undefined);
    const ranks = [...matched.map((r) => r.actualIndex)].sort((m, n) => m - n);
    matched.forEach((r, k) => {
      if (r.actualIndex !== ranks[k]) { r.mark = "序"; r.posNote = "你的：第 " + (r.actualIndex + 1) + " 行"; }
    });
  }
  let orderRows = 0;
  if (columnsSame && !missing.length && !extra.length && a.rows.length === x.rows.length) {
    rows.length = 0;
    x.rows.forEach((row, i) => {
      const other = a.rows[i];
      const bad = key(row) === key(other) ? [] : row.map((v, c) => (key([v]) !== key([other[c]]) ? c : -1)).filter((c) => c >= 0);
      if (bad.length) orderRows++;
      rows.push({ mark: bad.length ? "序" : "", cells: row, bad, actualCells: bad.length ? other : null });
    });
  }
  const parts = [];
  if (!columnsSame) parts.push("列不一致");
  const lessRows = Math.max(0, (x.rowCount ?? x.rows.length) - (a.rowCount ?? a.rows.length));
  const moreRows = Math.max(0, (a.rowCount ?? a.rows.length) - (x.rowCount ?? x.rows.length));
  if (lessRows) parts.push("少 " + lessRows + " 行");
  if (moreRows) parts.push("多 " + moreRows + " 行");
  if (!lessRows && !moreRows && (missing.length || extra.length)) parts.push(Math.max(missing.length, extra.length) + " 行内容不同");
  const misordered = rows.filter((r) => r.mark === "序" && r.posNote).length;
  if (misordered) parts.push(misordered + " 行顺序不同");
  if (!missing.length && !extra.length && columnsSame) parts.push(orderRows ? "行顺序不同（" + orderRows + " 行位置不同）" : "行内容相同但未通过判定");
  return { summary: parts.join("，"), columnsSame, rows, columns: columnsSame ? x.columns : x.columns, actualColumns: a.columns };
}
