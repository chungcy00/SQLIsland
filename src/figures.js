// 教学图解（B9）：全部用 HTML 文本渲染（标注均为真实文本，不依赖图片文字），数值来自课程示例数据。
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cell = (value) => (value === null || value === undefined ? '<span class="fig-null">NULL</span>' : value === "" ? "<code>''</code>" : esc(value));
const truthLabel = { true: ["✓", "真"], false: ["✕", "假"], unknown: ["?", "未知"] };
const roleName = { select: "取数", from: "取数", where: "筛选", group: "聚合", order: "排序" };
const tableOf = (lesson, name) => lesson.sourceTables.find((table) => table.name === name);
const colIndex = (table, name) => table.columns.findIndex((c) => c.name === name);
function truthTable(figure, lesson) {
  const table = tableOf(lesson, figure.table);
  return `<table class="fig-table"><thead><tr><th>${esc(figure.valueColumn)}</th><th><code>${esc(figure.predicate)}</code></th><th>WHERE 是否保留</th></tr></thead><tbody>${figure.rows.map((row) => {
    const [mark, name] = truthLabel[row.truth];
    return `<tr class="fig-row ${row.truth === "true" ? "kept" : "dropped"}"><td>${cell(row.value)}<small class="fig-key">${esc(figure.keyColumn)} = ${esc(row.key)}</small></td><td><span class="fig-truth ${row.truth}"><b aria-hidden="true">${mark}</b>${name}</span></td><td>${row.truth === "true" ? "保留" : "排除"}</td></tr>`;
  }).join("")}</tbody></table>${figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : ""}`;
}
function clauseMap(figure) {
  return `<ol class="fig-clauses">${figure.parts.map((part) => `<li class="fig-clause ${part.role}"><span class="fig-clause-tag">${esc(part.label)}</span><code>${esc(part.sql.length > 160 ? part.sql.slice(0, 150).trimEnd() + " …" : part.sql)}</code><small>${esc(part.note)}</small></li>`).join("")}</ol>`;
}
// 行数变化并入“分步执行”：返回第 index 步的行数徽章与数据变化表。
const scroll = (html) => `<div class="fig-scroll">${html}</div>`;
const plainTable = (columns, rows, marks) => `<table class="fig-table"><thead><tr>${columns.map((name) => `<th>${esc(name)}</th>`).join("")}${marks ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((row, i) => `<tr class="fig-row ${marks?.[i] === false ? "dropped" : "kept"}">${row.map((v) => `<td>${cell(v)}</td>`).join("")}${marks ? `<td>${marks[i] === false ? '<span class="fig-out">排除</span>' : ""}</td>` : ""}</tr>`).join("")}</tbody></table>`;
// 行数变化并入“分步执行”：返回第 index 步的行数徽章与数据变化表；没有可展示数据的步骤返回 null。
export function rowFlowStep(lesson, index) {
  const figure = (lesson.figures || []).find((item) => item.merge === "breakdown");
  const step = figure?.steps[index];
  if (!step || step.skip) return null;
  if (figure.kind === "stage-flow") {
    let previous = null;
    for (let i = index - 1; i >= 0; i--) if (!figure.steps[i].skip) { previous = figure.steps[i]; break; }
    const badge = previous ? `${previous.rows.length} → ${step.rows.length} 行` : `${step.rows.length} 行`;
    return { badge, html: scroll(plainTable(step.columns, step.rows)) };
  }
  const table = tableOf(lesson, figure.table);
  const key = colIndex(table, figure.keyColumn);
  const columns = figure.columns.map((name) => colIndex(table, name));
  const before = index === 0 ? table.rows.map((row) => row[key]) : figure.steps[index - 1].keptKeys;
  const kept = new Set(step.keptKeys);
  const rows = before.map((id) => table.rows.find((r) => r[key] === id));
  const badge = index === 0 ? `${kept.size} 行` : `${before.length} → ${kept.size} 行`;
  return { badge, html: scroll(plainTable(figure.columns, rows.map((row) => columns.map((c) => row[c])), rows.map((row) => kept.has(row[key])))) };
}
const shown = 4;
const miniTable = (columns, rows, marks = []) => `<div class="fig-scroll"><table class="fig-table fig-mini"><thead><tr>${columns.map((name, i) => `<th${marks.includes(i) ? ' class="new"' : ""}>${esc(name)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, shown).map((row) => `<tr class="fig-row kept">${row.map((v, i) => `<td${marks.includes(i) ? ' class="new"' : ""}>${cell(v)}</td>`).join("")}</tr>`).join("")}${rows.length > shown ? `<tr class="fig-more"><td colspan="${columns.length}">…共 ${rows.length} 行</td></tr>` : ""}</tbody></table></div>`;
function functionMap(figure) {
  const rows = figure.inputRows, n = rows.length;
  const calls = figure.outputs.map((output) => `<code>${esc(output.sql)}</code>`).join("");
  let result, badge;
  if (figure.form === "aggregate") {
    result = miniTable(figure.outputs.map((output) => output.label), [figure.outputs.map((output) => output.value)], figure.outputs.map((_, i) => i));
    badge = `${n} 行 → 1 行`;
  } else if (figure.form === "window") {
    result = miniTable([...figure.inputColumns, ...figure.outputs.map((output) => output.label)], rows.map((row, i) => [...row, ...figure.outputs.map((output) => output.values[i])]), figure.outputs.map((_, i) => figure.inputColumns.length + i));
    badge = `${n} 行 → ${n} 行，多出 ${figure.outputs.length} 列`;
  } else {
    result = miniTable([figure.inputColumns[0], ...figure.outputs.map((output) => output.label)], rows.map((row, i) => [row[0], ...figure.outputs.map((output) => output.values[i])]), figure.outputs.map((_, i) => i + 1));
    badge = `${n} 行 → ${n} 行`;
  }
  return `<div class="fig-fn"><div class="fig-fn-block"><small>输入 · ${n} 行</small>${miniTable(figure.inputColumns, rows)}</div><div class="fig-fn-call"><span class="fig-count">${esc(badge)}</span>${calls}</div><div class="fig-fn-block"><small>输出</small>${result}</div></div>${figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : ""}`;
}
function joinMap(figure) {
  const left = figure.left, right = figure.right;
  const head = `<tr><th colspan="${left.show.length}">${esc(left.table)}</th><th></th><th colspan="${right.show.length}">${esc(right.table)}</th></tr><tr class="fig-sub">${left.show.map((c) => `<th>${esc(c)}</th>`).join("")}<th></th>${right.show.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const counts = new Map(); for (const pair of figure.pairs) if (pair.left && pair.right) { const key = JSON.stringify(pair.left); counts.set(key, (counts.get(key) || 0) + 1); }
  const seen = new Set();
  const body = figure.pairs.map((pair) => {
    const matched = pair.left && pair.right, state = matched ? "match" : pair.kept ? "kept" : "dropped";
    const key = JSON.stringify(pair.left), dup = matched && counts.get(key) > 1;
    const leftCells = pair.left ? pair.left.map((v, i) => `<td>${cell(v)}${i === 0 && dup && !seen.has(key) ? ` <span class="fig-dup">×${counts.get(key)}</span>` : ""}</td>`).join("") : left.show.map(() => '<td class="fig-null">—</td>').join("");
    if (dup) seen.add(key);
    const link = `<td class="fig-link ${state}" aria-hidden="true">${matched ? "→" : pair.kept ? "⇢" : "✕"}</td>`;
    const rightCells = pair.right ? pair.right.map((v) => `<td>${cell(v)}</td>`).join("") : right.show.map(() => `<td class="fig-null">${pair.kept ? "NULL" : "—"}</td>`).join("");
    return `<tr class="fig-row ${state}">${leftCells}${link}${rightCells}</tr>`;
  }).join("");
  const legend = `<p class="fig-legend"><span>→ 匹配</span>${figure.joinType === "left" ? "<span>⇢ 无匹配，右侧补 NULL</span>" : ""}<span>✕ 无匹配，不保留</span></p>`;
  const kept = figure.pairs.filter((pair) => pair.kept).length;
  return `<div class="fig-scroll"><table class="fig-table fig-join"><thead>${head}</thead><tbody>${body}</tbody></table></div>${legend}<p class="fig-source"><code>${esc(figure.on)}</code> · ${esc(figure.joinType === "left" ? "LEFT JOIN" : "INNER JOIN")} 结果 ${kept} 行</p>${figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : ""}`;
}
function metricCard(figure) {
  const part = (kind, label, expr) => `<div class="fig-formula-part ${kind}"><small>${esc(label)}</small><code>${esc(expr)}</code></div>`;
  return `<div class="fig-metric-head"><span>输出列 <code>${esc(figure.metric.column)}</code></span><b>${esc(figure.metric.label)}</b></div>`
    + `<div class="fig-formula" role="group" aria-label="指标公式">${part("num", "分子 · " + figure.numerator.label, figure.numerator.expr)}<div class="fig-slash" aria-hidden="true"></div>${part("den", "分母 · " + figure.denominator.label, figure.denominator.expr)}</div>`
    + `<div class="fig-scope">${figure.scope.map((tag) => `<span class="fig-scope-tag"><b>${esc(tag.label)}</b>${esc(tag.text)}</span>`).join("")}</div>`
    + (figure.pitfall ? `<div class="fig-pitfall"><b>易错口径</b>${esc(figure.pitfall)}</div>` : "")
    + `<p class="fig-source">数据来源：${figure.sources.map((item) => `<code>${esc(item.table)}</code>（${item.fields.map(esc).join("、")}）`).join("；")}</p>`;
}
export function renderFigures(lesson, slot) {
  const list = (lesson.figures || []).filter((figure) => figure.slot === slot && !figure.merge);
  return list.map((figure) => {
    const body = figure.kind === "truth-table" ? truthTable(figure, lesson) : figure.kind === "metric-card" ? metricCard(figure) : figure.kind === "function-map" ? functionMap(figure) : figure.kind === "join-map" ? joinMap(figure) : clauseMap(figure);
    return `<figure class="figure figure-${figure.kind}" data-figure="${esc(figure.id)}"><figcaption>${esc(figure.title)}</figcaption>${body}</figure>`;
  }).join("");
}
