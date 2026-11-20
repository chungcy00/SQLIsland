// 教学图解（B9）：全部用 HTML 文本渲染（标注均为真实文本，不依赖图片文字），数值来自课程示例数据。
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cell = (value) => (value === null || value === undefined ? '<span class="fig-null">NULL</span>' : value === "" ? "<code>''</code>" : typeof value === "string" && /^\s|\s$/.test(value) ? `<code class="fig-pre">'${esc(value)}'</code>` : esc(value));
const truthLabel = { true: ["✓", "真"], false: ["✕", "假"], unknown: ["?", "未知"] };
const roleName = { select: "取数", from: "取数", where: "筛选", group: "聚合", order: "排序" };
const tableOf = (lesson, name) => lesson.sourceTables.find((table) => table.name === name);
const colIndex = (table, name) => table.columns.findIndex((c) => c.name === name);
// 真值表：① 原始数据 → ② 逐行判断（每行一句话：条件结果是真/假/未知，WHERE 只保留真）→ ③ 最终查询结果。
function truthTable(figure, lesson) {
  const table = tableOf(lesson, figure.table);
  const names = { true: "真", false: "假", unknown: "未知" };
  const raw = `<div class="fig-scroll"><table class="fig-table fig-mini fig-wrap"><thead><tr>${table.columns.map((c) => `<th${c.name === figure.valueColumn ? ' class="key"' : ""}>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr class="fig-row kept">${row.map((v, i) => `<td${table.columns[i].name === figure.valueColumn ? ' class="key"' : ""}>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const steps = figure.rows.map((row) => {
    const note = row.truth === "unknown" ? "（NULL 与任何值比较，结果都是未知）" : "";
    return `<li class="${row.truth === "true" ? "match" : row.truth === "unknown" ? "pad" : "drop"}"><span class="fig-truth ${row.truth}"><b aria-hidden="true">${truthLabel[row.truth][0]}</b>${names[row.truth]}</span> ${esc(figure.keyColumn)} = ${esc(row.key)}：${esc(figure.valueColumn)} 是 ${row.value === null ? "NULL" : esc(row.value)}，<code>${esc(figure.predicate)}</code> 的结果是“${names[row.truth]}”${note} → ${row.truth === "true" ? "保留这一行" : "不保留这一行"}</li>`;
  }).join("");
  const result = lesson.result;
  const out = `<div class="fig-scroll"><table class="fig-table fig-mini fig-wrap fig-result"><thead><tr>${result.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${result.rows.map((row) => `<tr class="fig-row kept">${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return `<h4 class="fig-step-h"><b>①</b> 原始数据</h4>${raw}`
    + `<h4 class="fig-step-h"><b>②</b> 逐行判断</h4><ul class="fig-pairs">${steps}</ul>`
    + `<h4 class="fig-step-h"><b>③</b> 最终查询结果 <span class="fig-total">共 ${result.rows.length} 行</span></h4>${out}`
    + (figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : "");
}
function clauseMap(figure) {
  return `<ol class="fig-clauses">${figure.parts.map((part) => `<li class="fig-clause ${part.role}"><span class="fig-clause-tag">${esc(part.label)}</span><code>${esc(part.sql.length > 160 ? part.sql.slice(0, 150).trimEnd() + " …" : part.sql)}</code><small>${esc(part.note)}</small></li>`).join("")}</ol>`;
}
// 行数变化并入“分步执行”：返回第 index 步的行数徽章与数据变化表。
const scroll = (html) => `<div class="fig-scroll">${html}</div>`;
const plainTable = (columns, rows, marks, keep = [], cls = "") => `<table class="fig-table ${cls}"><thead><tr>${columns.map((name, i) => `<th${keep.includes(i) ? ' class="new"' : ""}>${esc(name)}</th>`).join("")}${marks ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((row, i) => `<tr class="fig-row ${marks?.[i] === false ? "dropped" : "kept"}">${row.map((v, c) => `<td${keep.includes(c) ? ' class="new"' : ""}>${cell(v)}</td>`).join("")}${marks ? `<td>${marks[i] === false ? '<span class="fig-out">排除</span>' : ""}</td>` : ""}</tr>`).join("")}</tbody></table>`;
// 行数变化并入“分步执行”：返回第 index 步的行数徽章与数据变化表；没有可展示数据的步骤返回 null。
export function rowFlowStep(lesson, index) {
  const figure = (lesson.figures || []).find((item) => item.merge === "breakdown");
  const step = figure?.steps[index];
  if (!step || step.skip) return null;
  if (figure.kind === "stage-flow") {
    let previous = null;
    for (let i = index - 1; i >= 0; i--) if (!figure.steps[i].skip) { previous = figure.steps[i]; break; }
    const badge = previous ? `${previous.rows.length} → ${step.rows.length} 行` : `${step.rows.length} 行`;
    const label = (text) => `<p class="fig-flow-label">${text}</p>`;
    if (!previous) return { badge, html: label(`这一步得到的数据（${step.rows.length} 行）`) + scroll(plainTable(step.columns, step.rows, undefined, [], "fig-result")) };
    // 列没变时，把处理前里“这一步之后不再出现”的行标出来；列变了（例如只取其中几列）就只并排给出前后两张表。
    let marks;
    if (JSON.stringify(previous.columns) === JSON.stringify(step.columns)) {
      const left = new Map(); for (const row of step.rows) left.set(JSON.stringify(row), (left.get(JSON.stringify(row)) || 0) + 1);
      marks = previous.rows.map((row) => { const key = JSON.stringify(row), n = left.get(key) || 0; if (n > 0) { left.set(key, n - 1); return true; } return false; });
      if (marks.every(Boolean)) marks = undefined;
    }
    const cut = (rows, extra) => rows.length > 8 ? { rows: rows.slice(0, 8), extra: [...(extra || []).slice(0, 8)], more: rows.length } : { rows, extra, more: 0 };
    const before = cut(previous.rows, marks);
    const keep = step.columns.every((name) => previous.columns.includes(name)) && step.columns.length < previous.columns.length ? step.columns.map((name) => previous.columns.indexOf(name)) : [];
    return { badge, html: label(`处理前（${previous.rows.length} 行${keep.length ? "；黄色的列是这一步保留的列" : ""}）`) + scroll(plainTable(previous.columns, before.rows, before.extra, keep)) + (before.more ? `<p class="fig-flow-label">…共 ${before.more} 行</p>` : "") + label(`处理后（${step.rows.length} 行）`) + scroll(plainTable(step.columns, step.rows, undefined, [], "fig-result")) };
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
const miniTable = (columns, rows, marks = [], attrs = [], limit = shown, cls = "") => `<div class="fig-scroll"><table class="fig-table fig-mini ${cls}"><thead><tr>${columns.map((name, i) => `<th${marks.includes(i) ? ' class="new"' : ""}${attrs[i] || ""}>${esc(name)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, limit).map((row) => `<tr class="fig-row kept">${row.map((v, i) => `<td${marks.includes(i) ? ' class="new"' : ""}${attrs[i] || ""}>${cell(v)}</td>`).join("")}</tr>`).join("")}${rows.length > limit ? `<tr class="fig-more"><td colspan="${columns.length}">…共 ${rows.length} 行</td></tr>` : ""}</tbody></table></div>`;
const inAttr = (name) => ` data-col="${esc(name)}"`, outAttr = (i) => ` data-out="${i}"`;
function functionMap(figure) {
  const rows = figure.inputRows, n = rows.length;
  // 点函数调用：高亮它用到的输入列和它产生的输出列，其余变淡（再点取消）。用到的列按调用文本里出现的列名判断。
  const used = (output) => figure.inputColumns.filter((name) => new RegExp("\\b" + name + "\\b").test(output.sql));
  const calls = figure.outputs.map((output, i) => `<button type="button" class="fig-call" data-action="fnPick" data-arg="${esc(figure.id)}:${i}" data-cols="${esc(used(output).join("|"))}" aria-pressed="false"><code>${esc(output.sql)}</code></button>`).join("");
  const inAttrs = figure.inputColumns.map(inAttr);
  let result, badge;
  if (figure.form === "aggregate") {
    result = miniTable(figure.outputs.map((output) => output.label), [figure.outputs.map((output) => output.value)], figure.outputs.map((_, i) => i), figure.outputs.map((_, i) => outAttr(i)), 8, "fig-result");
    badge = `${n} 行 → 1 行`;
  } else if (figure.form === "window") {
    result = miniTable([...figure.inputColumns, ...figure.outputs.map((output) => output.label)], rows.map((row, i) => [...row, ...figure.outputs.map((output) => output.values[i])]), figure.outputs.map((_, i) => figure.inputColumns.length + i), [...inAttrs, ...figure.outputs.map((_, i) => outAttr(i))], shown, "fig-result");
    badge = `${n} 行 → ${n} 行，多出 ${figure.outputs.length} 列`;
  } else {
    result = miniTable([figure.inputColumns[0], ...figure.outputs.map((output) => output.label)], rows.map((row, i) => [row[0], ...figure.outputs.map((output) => output.values[i])]), figure.outputs.map((_, i) => i + 1), [inAttrs[0], ...figure.outputs.map((_, i) => outAttr(i))], shown, "fig-result");
    badge = `${n} 行 → ${n} 行`;
  }
  return `<div class="fig-fn"><div class="fig-fn-block"><small><b class="fig-no">①</b> 原始数据（${n} 行）</small>${miniTable(figure.inputColumns, rows, [], inAttrs)}</div><div class="fig-fn-call"><small class="fig-fn-title"><b class="fig-no">②</b> 函数处理</small><span class="fig-count">${esc(badge)}</span>${calls}<small class="fig-hint">点函数调用，高亮它用到的输入列和输出列</small></div><div class="fig-fn-block"><small><b class="fig-no">③</b> 处理后的结果（共 ${figure.form === "aggregate" ? 1 : n} 行；黄色是函数算出来的新值）</small>${result}</div></div>${figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : ""}`;
}
// 连接类型的小示意（仅作补充，不是主图）：左右两个圆，高亮保留的区域。
function vennSmall(joinType) {
  const left = ["left", "full"].includes(joinType), right = ["right", "full"].includes(joinType);
  const fill = "var(--primary)";
  const circles = `<circle cx="30" cy="24" r="20"/><circle cx="54" cy="24" r="20"/>`;
  const regions = joinType === "inner"
    ? `<clipPath id="v-${joinType}"><circle cx="30" cy="24" r="20"/></clipPath><circle cx="54" cy="24" r="20" clip-path="url(#v-${joinType})" fill="${fill}" opacity=".35"/>`
    : `${left ? `<circle cx="30" cy="24" r="20" fill="${fill}" opacity=".35"/>` : ""}${right ? `<circle cx="54" cy="24" r="20" fill="${fill}" opacity=".35"/>` : ""}`;
  return `<svg class="fig-venn" viewBox="0 0 84 48" width="84" height="48" aria-hidden="true" focusable="false">${regions}<g fill="none" stroke="currentColor" stroke-width="1.5">${circles}</g></svg>`;
}
// 连接关系图：规则 → ① 原始数据（原表原样、并排）→ ② 匹配过程（连线）→ ③ 最终查询结果（只含实际返回的行）。
// 对比卡：并列几块“原始数据 → 处理 → 数字”，用大数字突出正确与错误的结果。
function compareCard(figure) {
  const tone = { bad: "有问题", good: "正确", neutral: "" };
  return `<div class="fig-compare">${figure.panels.map((panel) => `<section class="fig-panel-card ${panel.tone}"><h4><span class="fig-tone">${esc(tone[panel.tone])}</span>${esc(panel.label)}</h4>${panel.note ? `<p class="fig-panel-note">${esc(panel.note)}</p>` : ""}${miniTable(panel.columns, panel.rows, [], [], 12, "fig-wrap")}<div class="fig-big"><small>${esc(panel.big.label)}</small><b>${esc(panel.big.value)}</b></div></section>`).join("")}</div>`;
}
const joinCn = { inner: "内连接", left: "左连接", right: "右连接", full: "全连接" };
const joinRule = {
  inner: "只保留两张表都配上的行；任何一边配不上的行都不进入结果。",
  left: "左表的每一行都保留；左表某一行配不上时，右表的列补 NULL。右表配不上的行不保留。",
  right: "右表的每一行都保留；右表某一行配不上时，左表的列补 NULL。左表配不上的行不保留。",
  full: "两张表的每一行都保留；哪一边配不上，另一边的列就补 NULL。",
};
const ROW_H = 54, ROW_GAP = 6;
function joinMap(figure, lesson) {
  const { left, right } = figure;
  const sourceOf = (spec) => { const tbl = lesson.sourceTables.find((item) => item.name === spec.table); const idx = spec.show.map((name) => tbl.columns.findIndex((c) => c.name === name)); return tbl.rows.map((row) => idx.map((i) => row[i])); };
  const leftRows = sourceOf(left), rightRows = sourceOf(right);
  const keyL = left.show.indexOf(left.key), keyR = right.show.indexOf(right.key);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const links = figure.pairs.filter((pair) => pair.left && pair.right).map((pair) => [leftRows.findIndex((row) => same(row, pair.left)), rightRows.findIndex((row) => same(row, pair.right))]);
  const matchedL = new Set(links.map((link) => link[0])), matchedR = new Set(links.map((link) => link[1]));
  const keepLeft = ["left", "full"].includes(figure.joinType), keepRight = ["right", "full"].includes(figure.joinType);
  const filter = figure.rightFilter, filterAt = filter ? right.show.indexOf(filter.column) : -1;
  const text = (value) => (value === null || value === undefined ? "NULL" : String(value));
  // ① 原始数据：两张表左右并排，原样展示，用于配对的列标色。
  const source = (spec, rows, keyIndex, title) => `<div><small>${esc(title)}</small><table class="fig-table fig-mini fig-wrap"><thead><tr>${spec.show.map((name, i) => `<th${i === keyIndex ? ' class="key"' : ""}>${esc(name)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr class="fig-row kept">${row.map((v, i) => `<td${i === keyIndex ? ' class="key"' : ""}>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  // ② 匹配过程：左右两列记录，用连线连接“用于连接的列”相同的记录；黄色是没有配上的记录。
  const chip = (row, keyIndex, spec, state, note) => `<div class="fig-chip ${state}" style="height:${ROW_H}px"><b>${esc(spec.show[keyIndex])}：${cell(row[keyIndex])}</b><span>${row.filter((_, i) => i !== keyIndex).map((v, i) => `${esc(spec.show.filter((_, k) => k !== keyIndex)[i])} ${esc(text(v))}`).join(" · ")}</span>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  const leftNote = (index) => (matchedL.has(index) ? "" : keepLeft ? `未匹配 · 保留，${right.table} 的列补 NULL` : "未匹配 · 不保留");
  const rightNote = (row, index) => {
    if (matchedR.has(index)) return "";
    const outside = filter && filterAt >= 0 && !(row[filterAt] >= filter.gte && row[filterAt] < filter.lt);
    const why = outside ? "不满足 ON 里的日期条件" : "未匹配";
    return `${why} · ${keepRight ? `保留，${left.table} 的列补 NULL` : "不保留"}`;
  };
  const height = Math.max(leftRows.length, rightRows.length) * (ROW_H + ROW_GAP) - ROW_GAP;
  const y = (index) => index * (ROW_H + ROW_GAP) + ROW_H / 2;
  const lines = links.map(([a, b]) => `<path d="M0,${y(a)} C45,${y(a)} 55,${y(b)} 100,${y(b)}"/>`).join("");
  const match = `<div class="fig-match"><div class="fig-col">${leftRows.map((row, i) => chip(row, keyL, left, matchedL.has(i) ? "match" : "none", leftNote(i))).join("")}</div><svg class="fig-lines" viewBox="0 0 100 ${height}" preserveAspectRatio="none" style="height:${height}px" aria-hidden="true" focusable="false">${lines}</svg><div class="fig-col">${rightRows.map((row, i) => chip(row, keyR, right, matchedR.has(i) ? "match" : "none", rightNote(row, i))).join("")}</div></div>`;
  // ③ 最终查询结果：只列实际返回的行，补出来的 NULL 用黄色突出。
  const kept = figure.pairs.filter((pair) => pair.kept);
  const resultRows = kept.map((pair) => ({ left: pair.left, right: pair.right }));
  const columns = [...left.show, ...right.show];
  const body = resultRows.map((row) => `<tr class="fig-row kept">${left.show.map((_, i) => `<td${row.left ? "" : ' class="pad"'}>${row.left ? cell(row.left[i]) : "NULL"}</td>`).join("")}${right.show.map((_, i) => `<td${row.right ? "" : ' class="pad"'}>${row.right ? cell(row.right[i]) : "NULL"}</td>`).join("")}</tr>`).join("");
  const result = `<div class="fig-scroll"><table class="fig-table fig-mini fig-wrap fig-result"><thead><tr class="fig-group"><th colspan="${left.show.length}">来自 ${esc(left.table)}</th><th colspan="${right.show.length}">来自 ${esc(right.table)}</th></tr><tr>${columns.map((name) => `<th>${esc(name)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  return `<div class="fig-rule">${vennSmall(figure.joinType)}<p><b>${esc(joinCn[figure.joinType])}</b>：${esc(joinRule[figure.joinType])}</p></div>`
    + `<h4 class="fig-step-h"><b>①</b> 原始数据</h4><div class="fig-join-src">${source(left, leftRows, keyL, `左表 ${left.table}`)}${source(right, rightRows, keyR, `右表 ${right.table}`)}</div>`
    + `<h4 class="fig-step-h"><b>②</b> 匹配过程</h4><p class="fig-hint">用 <code>${esc(figure.on)}</code> 配对：${esc(left.key)} 与 ${esc(right.key)} 相同的记录用线连起来；黄色是没有配上的记录。</p>${match}`
    + `<h4 class="fig-step-h"><b>③</b> 最终查询结果 <span class="fig-total">共 ${resultRows.length} 行</span></h4>${result}`
    + (figure.caption ? `<div class="fig-caption">${esc(figure.caption)}</div>` : "");
}
function metricCard(figure) {
  const part = (kind, label, expr) => `<div class="fig-formula-part ${kind}"><small>${esc(label)}</small><code>${esc(expr)}</code></div>`;
  return `<div class="fig-metric-head"><span>输出列 <code>${esc(figure.metric.column)}</code></span><b>${esc(figure.metric.label)}</b></div>`
    + `<div class="fig-formula" role="group" aria-label="指标公式">${part("num", "分子 · " + figure.numerator.label, figure.numerator.expr)}<div class="fig-slash" aria-hidden="true"></div>${part("den", "分母 · " + figure.denominator.label, figure.denominator.expr)}</div>`
    + `<div class="fig-scope">${figure.scope.map((tag) => `<span class="fig-scope-tag"><b>${esc(tag.label)}</b>${esc(tag.text)}</span>`).join("")}</div>`
    + (figure.pitfall ? `<div class="fig-pitfall"><b>易错口径</b>${esc(figure.pitfall)}</div>` : "")
    + `<p class="fig-source">数据来源：${figure.sources.map((item) => `<code>${esc(item.table)}</code>（${item.fields.map(esc).join("、")}）`).join("；")}</p>`;
}
const joinName = { inner: "INNER JOIN 内连接", left: "LEFT JOIN 左连接", right: "RIGHT JOIN 右连接", full: "FULL JOIN 全连接" };
export function renderFigures(lesson, slot) {
  const list = (lesson.figures || []).filter((figure) => figure.slot === slot && !figure.merge);
  const joins = list.filter((figure) => figure.kind === "join-map");
  let grouped = false;
  return list.map((figure) => {
    // 同一节有多张关系图时合并成一张卡，用顶部标签切换（INNER/LEFT/RIGHT/FULL）。
    if (figure.kind === "join-map" && joins.length > 1) {
      if (grouped) return "";
      grouped = true;
      const group = esc(joins[0].id) + "-tabs";
      const tabs = joins.map((item, index) => `<button type="button" role="tab" class="fig-tab" data-action="figTab" data-arg="${group}:${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${esc(joinName[item.joinType])}</button>`).join("");
      const panels = joins.map((item, index) => `<div class="fig-panel" role="tabpanel" data-figure="${esc(item.id)}"${index ? " hidden" : ""}>${joinMap(item, lesson)}</div>`).join("");
      const conclusion = joins.find((item) => item.conclusion)?.conclusion;
      return `<figure class="figure figure-join-map figure-tabs" data-figure-group="${group}"><figcaption>连接方式对比</figcaption><div class="fig-tabs" role="tablist" aria-label="连接方式">${tabs}</div>${panels}${conclusion ? `<p class="fig-conclusion"><b>结论</b>${esc(conclusion)}</p>` : ""}</figure>`;
    }
    const body = figure.kind === "truth-table" ? truthTable(figure, lesson) : figure.kind === "metric-card" ? metricCard(figure) : figure.kind === "function-map" ? functionMap(figure) : figure.kind === "join-map" ? joinMap(figure, lesson) : figure.kind === "compare-card" ? compareCard(figure) : clauseMap(figure);
    return `<figure class="figure figure-${figure.kind}" data-figure="${esc(figure.id)}"><figcaption>${esc(figure.title)}</figcaption>${body}${figure.conclusion ? `<p class="fig-conclusion"><b>结论</b>${esc(figure.conclusion)}</p>` : ""}</figure>`;
  }).join("");
}
