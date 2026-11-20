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
  return `<ol class="fig-clauses">${figure.parts.map((part) => `<li class="fig-clause ${part.role}"><span class="fig-clause-tag">${esc(part.label)}</span><code>${esc(part.sql)}</code><small>${esc(part.note)}</small></li>`).join("")}</ol>`;
}
// 行数变化并入“分步执行”：返回第 index 步的行数徽章与数据变化表。
export function rowFlowStep(lesson, index) {
  const figure = (lesson.figures || []).find((item) => item.kind === "row-flow");
  const step = figure?.steps[index];
  if (!step) return null;
  const table = tableOf(lesson, figure.table);
  const key = colIndex(table, figure.keyColumn);
  const columns = figure.columns.map((name) => colIndex(table, name));
  const before = index === 0 ? table.rows.map((row) => row[key]) : figure.steps[index - 1].keptKeys;
  const kept = new Set(step.keptKeys);
  const rows = before.map((id) => table.rows.find((r) => r[key] === id));
  const badge = index === 0 ? `${kept.size} 行` : `${before.length} → ${kept.size} 行`;
  const html = `<table class="fig-table"><thead><tr>${figure.columns.map((name) => `<th>${esc(name)}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map((row) => `<tr class="fig-row ${kept.has(row[key]) ? "kept" : "dropped"}">${columns.map((c) => `<td>${cell(row[c])}</td>`).join("")}<td>${kept.has(row[key]) ? "" : '<span class="fig-out">排除</span>'}</td></tr>`).join("")}</tbody></table>`;
  return { badge, html };
}
export function renderFigures(lesson, slot) {
  const list = (lesson.figures || []).filter((figure) => figure.slot === slot && !figure.merge);
  return list.map((figure) => {
    const body = figure.kind === "truth-table" ? truthTable(figure, lesson) : clauseMap(figure);
    return `<figure class="figure figure-${figure.kind}" data-figure="${esc(figure.id)}"><figcaption>${esc(figure.title)}</figcaption>${body}</figure>`;
  }).join("");
}
