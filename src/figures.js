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
// 分页步骤的行角色：跳过 / 本次取出 / 超出取出范围（不是“排除”）。
const pageRoleName = { skip: "跳过", take: "本次取出", beyond: "超出取出范围" };
const roleTag = (role) => `<span class="fig-role ${role}">${pageRoleName[role]}</span>`;
const markCell = (mark) => (mark === false ? '<span class="fig-out">排除</span>' : typeof mark === "string" ? roleTag(mark) : "");
const plainTable = (columns, rows, marks, keep = [], cls = "") => `<table class="fig-table ${cls}"><thead><tr>${columns.map((name, i) => `<th${keep.includes(i) ? ' class="new"' : ""}>${esc(name)}</th>`).join("")}${marks ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((row, i) => `<tr class="fig-row ${marks?.[i] === false ? "dropped" : typeof marks?.[i] === "string" ? "role-" + marks[i] : "kept"}">${row.map((v, c) => `<td${keep.includes(c) ? ' class="new"' : ""}>${cell(v)}</td>`).join("")}${marks ? `<td>${markCell(marks[i])}</td>` : ""}</tr>`).join("")}</tbody></table>`;
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
    if (step.roles) {
      marks = step.roles;
      const count = (role) => step.roles.filter((item) => item === role).length;
      const before = previous.rows.length > 8 ? { rows: previous.rows.slice(0, 8), extra: marks.slice(0, 8), more: previous.rows.length } : { rows: previous.rows, extra: marks, more: 0 };
      const keep = step.columns.every((name) => previous.columns.includes(name)) && step.columns.length < previous.columns.length ? step.columns.map((name) => previous.columns.indexOf(name)) : [];
      return { badge, html: label(`处理前（${previous.rows.length} 行已排好序：跳过 ${count("skip")} 条 · 本次取出 ${count("take")} 条${count("beyond") ? ` · 超出取出范围 ${count("beyond")} 条` : ""}）`) + scroll(plainTable(previous.columns, before.rows, before.extra, keep)) + (before.more ? `<p class="fig-flow-label">…共 ${before.more} 行</p>` : "") + label(`处理后（${step.rows.length} 行，就是“本次取出”的记录）`) + scroll(plainTable(step.columns, step.rows, undefined, [], "fig-result")) };
    }
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
// 分页位置示意图：已排好序的记录，标出 跳过 / 本次取出 / 超出取出范围。两个标签页：本节例子（LIMIT 3 OFFSET 2），以及每页 2 条时各页的位置。
function pageMap(figure) {
  const { limit, offset } = figure.example;
  const roleOf = (skip, take, index) => (index < skip ? "skip" : index < skip + take ? "take" : "beyond");
  const rec = (row, index, compact) => `<span class="fig-pos">${index + 1}</span><b>${esc(row[1])}</b><small>${compact ? "" : `编号 ${esc(row[0])} · `}价格 ${esc(row[2])}</small>`;
  const group = esc(figure.id) + "-tabs";
  const single = `<p class="fig-flow-label">先按 ${esc(figure.orderBy)} 排好序，再 <code>LIMIT ${limit} OFFSET ${offset}</code>：</p><ol class="fig-case">${figure.rows.map((row, index) => `<li class="fig-case-row role-${roleOf(offset, limit, index)}"><span class="fig-case-rec">${rec(row, index)}</span>${roleTag(roleOf(offset, limit, index))}</li>`).join("")}</ol><p class="fig-legend">${roleTag("skip")} OFFSET ${offset}：先跳过前 ${offset} 条　${roleTag("take")} LIMIT ${limit}：再取出 ${limit} 条　${roleTag("beyond")} 排在后面，这次用不到</p>${figure.conclusion ? `<p class="fig-conclusion"><b>结论</b>${esc(figure.conclusion)}</p>` : ""}`;
  const n = figure.pageSize;
  const head = figure.pages.map((page) => `<th class="fig-page-h"><code>LIMIT ${n}</code><code>OFFSET ${page.offset}</code></th>`).join("");
  const body = figure.rows.map((row, index) => `<tr><td class="fig-page-rec">${rec(row, index, true)}</td>${figure.pages.map((page) => `<td class="fig-page-cell role-${roleOf(page.offset, n, index)}">${roleTag(roleOf(page.offset, n, index))}</td>`).join("")}</tr>`).join("");
  const pages = `<p class="fig-flow-label">每页 ${n} 条时，每一页都是 <code>LIMIT ${n} OFFSET 要跳过的条数</code>，各页跳过、取出的记录如下：</p>${scroll(`<table class="fig-table fig-page-map"><thead><tr><th>排好序的记录</th>${head}</tr></thead><tbody>${body}</tbody></table>`)}<p class="fig-legend">${roleTag("skip")} OFFSET 跳过的记录　${roleTag("take")} LIMIT 取出的 ${n} 条　${roleTag("beyond")} 这一页用不到</p>${figure.pagesNote ? `<p class="fig-conclusion"><b>结论</b>${esc(figure.pagesNote)}</p>` : ""}`;
  const tabs = ["本节例子：跳过 2 取 3", `分页：每页 ${n} 条`].map((label, i) => `<button type="button" role="tab" class="fig-tab" data-action="figTab" data-arg="${group}:${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join("");
  return `<div class="fig-tabs" role="tablist" aria-label="示意图">${tabs}</div><div class="fig-panel" role="tabpanel">${single}</div><div class="fig-panel" role="tabpanel" hidden>${pages}</div>`;
}
// 处理前 → 处理中 → 处理后：每个阶段一张（或两张并排）表，相同分组键的行同色，行尾标签说明这一行发生了什么。
function flowMap(figure) {
  const flowTable = (tbl) => {
    const bandCols = (Array.isArray(tbl.bandBy) ? tbl.bandBy : tbl.bandBy ? [tbl.bandBy] : []).map((name) => tbl.columns.indexOf(name));
    const bandKey = (row) => JSON.stringify(bandCols.map((i) => row[i]));
    const band = bandCols.length ? 0 : -1;
    const order = []; if (band >= 0) for (const row of tbl.rows) if (!order.includes(bandKey(row))) order.push(bandKey(row));
    // 标签放在行尾会把宽表撑出框：列多或标签长时，改成每行下面单独一行显示标签。
    const longest = tbl.tags ? Math.max(0, ...tbl.tags.map((t) => (t ? t.text.length : 0))) : 0;
    const stack = !!tbl.tags && (tbl.columns.length >= 4 || (tbl.columns.length >= 3 && longest > 10));
    const side = !!tbl.tags && !stack;
    const dense = tbl.columns.length >= 4 || tbl.columns.length + (side ? 1 : 0) >= 5;
    const tagHtml = (t) => (t ? `<span class="fig-role ${t.tone}">${esc(t.text)}</span>` : "");
    return `${tbl.name ? `<p class="fig-flow-name">${esc(tbl.name)}（${tbl.rows.length} 行）</p>` : ""}${scroll(`<table class="fig-table fig-flow-table${dense ? " dense" : ""}${stack ? " stacked" : ""}"><thead><tr>${tbl.columns.map((name) => `<th>${esc(name).replace(/_/g, "_<wbr>")}</th>`).join("")}${side ? "<th></th>" : ""}</tr></thead><tbody>${tbl.rows.map((row, i) => `<tr class="${band >= 0 ? "band-" + (order.indexOf(bandKey(row)) % 4) : ""}${stack && tbl.tags[i] ? " has-tag" : ""}">${row.map((v) => `<td>${cell(v)}</td>`).join("")}${side ? `<td>${tagHtml(tbl.tags[i])}</td>` : ""}</tr>${stack && tbl.tags[i] ? `<tr class="tag-row ${band >= 0 ? "band-" + (order.indexOf(bandKey(row)) % 4) : ""}"><td colspan="${tbl.columns.length}">${tagHtml(tbl.tags[i])}</td></tr>` : ""}`).join("")}</tbody></table>`)}`;
  };
  const flow = (variant) => `<div class="fig-flow-map">${variant.stages.map((stage, i) => `${stage.via ? `<div class="fig-step-arrow"><span aria-hidden="true">↓</span><em>${esc(stage.via)}</em></div>` : ""}<div class="fig-stage"><p class="fig-flow-label">${esc(stage.label)}</p>${stage.note ? `<p class="fig-stage-note">${esc(stage.note)}</p>` : ""}${stage.tables.map(flowTable).join("")}</div>`).join("")}</div>${variant.conclusion ? `<p class="fig-conclusion"><b>结论</b>${esc(variant.conclusion)}</p>` : ""}`;
  if (!figure.variants) return flow({ stages: figure.stages, conclusion: figure.conclusion });
  const group = esc(figure.id) + "-tabs";
  const tabs = figure.variants.map((variant, i) => `<button type="button" role="tab" class="fig-tab" data-action="figTab" data-arg="${group}:${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(variant.label)}</button>`).join("");
  return `<div class="fig-tabs" role="tablist" aria-label="示意图">${tabs}</div>${figure.variants.map((variant, i) => `<div class="fig-panel" role="tabpanel"${i ? " hidden" : ""}>${flow(variant)}</div>`).join("")}`;
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
  return `<div class="fig-compare">${figure.panels.map((panel) => `<section class="fig-panel-card ${panel.tone}"><h4><span class="fig-tone">${esc(tone[panel.tone])}</span>${esc(panel.label)}</h4>${panel.note ? `<p class="fig-panel-note">${esc(panel.note)}</p>` : ""}${miniTable(panel.columns, panel.rows, [], [], 12, "fig-wrap")}<div class="fig-big"><small>${esc(panel.big.label)}</small><b>${esc(panel.big.value === null ? "NULL" : panel.big.value)}</b></div></section>`).join("")}</div>`;
}
function tipCard(figure) {
  const name = { good: "可以这样", bad: "要当心", neutral: "先弄清" };
  return `<div class="fig-tips">${figure.items.map((item) => `<section class="fig-tip ${item.tone}"><h4><span class="fig-tone">${name[item.tone]}</span>${esc(item.label)}</h4><p>${esc(item.text)}</p></section>`).join("")}</div>`;
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
// 指标公式卡 v2：名称 → 含义 → 中文公式 → 数值示例 → 结果解读 → 对应 SQL → 特殊情况（仅适用时）。
const mcNumber = (value, decimals = 2) => (typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(decimals, 2) }) : String(value));
function metricCard(figure) {
  const f = figure.formula, ex = figure.example, unit = ex.result.unit || "";
  const fraction = f.denominator ? `<span class="mc-frac"><span class="mc-num">${esc(f.numerator)}</span><span class="mc-den">${esc(f.denominator)}</span></span>` : `<span class="mc-plain">${esc(f.numerator)}</span>`;
  const formula = `<div class="mc-formula" role="group" aria-label="${esc(f.lhs)}的计算公式"><span class="mc-lhs">${esc(f.lhs)}</span><span class="mc-eq">＝</span>${fraction}${f.times ? `<span class="mc-times">${esc(f.times)}</span>` : ""}</div>`;
  const inputs = ex.inputs.map((input) => `<div class="mc-input"><small>${esc(input.label)}</small><b>${esc(mcNumber(input.value, 2))}</b>${input.unit ? `<em>${esc(input.unit)}</em>` : ""}</div>`).join("");
  const resultText = `${mcNumber(ex.result.value, ex.result.decimals)}${unit === "%" ? "%" : unit ? " " + unit : ""}`;
  const example = `<div class="mc-example"><div class="mc-inputs">${inputs}</div><p class="mc-process">${esc(ex.process)}</p><div class="mc-result"><small>计算结果</small><b>${esc(mcNumber(ex.result.value, ex.result.decimals))}</b><span>${esc(unit)}</span></div></div>`;
  const notes = (figure.notes || []).map((note) => `<li>${note.label ? `<b>${esc(note.label)}</b>` : ""}${esc(note.text)}</li>`).join("");
  return `<p class="mc-meaning"><b>指标含义</b>${esc(figure.meaning)}</p>${formula}<h4 class="mc-h">数值示例</h4>${example}<p class="mc-reading"><b>结果解读</b>${esc(figure.interpretation.replace("{result}", resultText))}</p><div class="mc-sql"><small>对应 SQL 写法</small><pre><code>${figure.sql.lines.map(esc).join("\n")}</code></pre></div>${notes ? `<h4 class="mc-h">特殊情况</h4><ul class="mc-notes">${notes}</ul>` : ""}`;
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
    const body = figure.kind === "truth-table" ? truthTable(figure, lesson) : figure.kind === "metric-card" ? metricCard(figure) : figure.kind === "function-map" ? functionMap(figure) : figure.kind === "join-map" ? joinMap(figure, lesson) : figure.kind === "compare-card" ? compareCard(figure) : figure.kind === "page-map" ? pageMap(figure) : figure.kind === "flow-map" ? flowMap(figure) : figure.kind === "tip-card" ? tipCard(figure) : clauseMap(figure);
    return `<figure class="figure figure-${figure.kind}" data-figure="${esc(figure.id)}"${figure.kind === "page-map" || (figure.kind === "flow-map" && figure.variants) ? ` data-figure-group="${esc(figure.id)}-tabs"` : ""}><figcaption>${esc(figure.title)}</figcaption>${body}${figure.conclusion && !["page-map", "flow-map"].includes(figure.kind) ? `<p class="fig-conclusion"><b>结论</b>${esc(figure.conclusion)}</p>` : ""}</figure>`;
  }).join("");
}
