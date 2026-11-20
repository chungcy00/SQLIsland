// 查询思路 / 业务指标卡背面的“展示层重组”：只读，输入 sections，输出供渲染的块；不改原数据，不丢内容。

const numbered = /^\s*\d+\s*[.、．]\s*/;
const isAlt = (title) => /本地(显式)?替代/.test(title || "");

// 把“查询思路”文字与“查询流程”图合并为步骤时间线。
// 仅当文字行数与流程节点数一致时合并；每个节点的文字说明都保留；否则返回 null，调用方原样显示两块。
export function mergeTimeline(textSection, diagramSection) {
  const nodes = diagramSection?.nodes || [];
  const lines = String(textSection?.content ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!nodes.length || lines.length !== nodes.length) return null;
  // 流程图是链：按 edges 排序节点
  const edges = diagramSection.edges || [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const next = new Map(edges.map((x) => [String(x.from), x]));
  const targets = new Set(edges.map((x) => String(x.to)));
  const first = nodes.find((n) => !targets.has(String(n.id))) || nodes[0];
  const ordered = [];
  const seen = new Set();
  let cur = first;
  while (cur && !seen.has(String(cur.id))) {
    seen.add(String(cur.id));
    ordered.push({ node: cur, via: ordered.length ? edges.find((x) => String(x.to) === String(cur.id))?.label || "" : "" });
    const edge = next.get(String(cur.id));
    cur = edge ? byId.get(String(edge.to)) : null;
  }
  if (ordered.length !== nodes.length) return null;
  const steps = ordered.map(({ node }, i) => {
    const body = lines[i].replace(numbered, "");
    const label = String(node.label).replace(numbered, "").trim();
    let detail = "";
    if (body === label) detail = "";
    else if (body.startsWith(label)) detail = body.slice(label.length).replace(/^[：:，,\s]+/, "");
    else detail = body; // 文字与节点标题不同：整句作为说明，不丢内容
    return { title: label, detail };
  });
  return steps;
}

// 把相邻的 代码… + 结果表 配成一组；数据示例表单独保留。
export function groupRuns(sections) {
  const out = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (s.type === "code") {
      const codes = [];
      let j = i;
      while (j < sections.length && sections[j].type === "code") codes.push(sections[j++]);
      if (sections[j]?.type === "table" && !/^数据示例/.test(sections[j].title || "")) {
        out.push({ kind: "run", codes, result: sections[j] });
        i = j + 1;
        continue;
      }
      codes.forEach((c) => out.push({ kind: "section", section: c }));
      i = j;
      continue;
    }
    out.push({ kind: "section", section: s });
    i++;
  }
  return out;
}

const stripTitle = (t) =>
  String(t || "")
    .replace(/^(参考代码|查询代码|查询结果|代码|结果)\s*[：:]?\s*/, "")
    .replace(/\s*·\s*(本地(显式)?替代语句?|查询代码|查询结果)\s*$/, "")
    .replace(/\s*[（(]验证代码[）)]\s*$/, "")
    .trim();

export function runTitle(run, fallback) {
  const main = run.codes.find((c) => !isAlt(c.title)) || run.codes[0];
  const title = stripTitle(main.title) || stripTitle(run.result.title);
  return title && !isAlt(title) ? title : fallback;
}
export { isAlt };

// ---- 业务指标：中文数学公式 → 名称 / 分式 ----
function topLevelIndexes(text, chars) {
  const hits = [];
  let depth = 0;
  [...text].forEach((ch, i) => {
    if ("（(".includes(ch)) depth++;
    else if ("）)".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && chars.includes(ch)) hits.push(i);
  });
  return hits;
}
// 去掉“整体被一对括号包住”的外层括号（仅显示层）。
const unwrap = (t) => {
  const s = t.trim();
  if (!/^[（(]/.test(s) || !/[）)]$/.test(s)) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if ("（(".includes(s[i])) depth++;
    else if ("）)".includes(s[i])) {
      depth--;
      if (depth === 0 && i < s.length - 1) return s; // 第一对括号在末尾之前就闭合了
    }
  }
  return s.slice(1, -1).trim();
};
// 一行公式：返回 { name, expr, fraction: {top, bottom, suffix} | null }
export function parseFormula(line) {
  const text = String(line).trim().replace(/[。.]$/, "");
  const eq = topLevelIndexes(text, "＝=");
  const name = eq.length ? text.slice(0, eq[0]).trim() : "";
  const expr = eq.length ? text.slice(eq[0] + 1).trim() : text;
  const div = topLevelIndexes(expr, "÷");
  let fraction = null;
  if (div.length === 1) {
    let top = expr.slice(0, div[0]).trim();
    let bottom = expr.slice(div[0] + 1).trim();
    let suffix = "";
    const m = bottom.match(/^(.*?)\s*[×x]\s*100\s*%$/);
    if (m && m[1]) {
      bottom = m[1];
      suffix = "×100%";
    }
    if (top && bottom) fraction = { top: unwrap(top), bottom: unwrap(bottom), suffix };
  }
  return { name, expr, fraction };
}
export function formulaLines(content) {
  return String(content ?? "").split(/\n+|；/).map((l) => l.trim()).filter(Boolean);
}
// 统计口径：按句号拆成条目，便于初学者阅读（文字原样，仅分段）。
export function scopeItems(content) {
  return String(content ?? "").split(/(?<=。)/).map((l) => l.trim()).filter(Boolean);
}

// ---- 闪卡教学图示：全部由卡片自己的数据计算，不新增任何知识内容 ----
const SQL_TOKEN = /\s+|'(?:''|[^'])*'|"[^"]*"|`[^`]*`|\d+(?:\.\d+)?|[A-Za-z_][\w$]*|[^\sA-Za-z_\d]/g;
export const sqlTokens = (sql) => String(sql ?? "").match(SQL_TOKEN) || [];
// 常见错误：错误写法 vs 正确写法的逐词对比（忽略空白与大小写；两边都标出“不一样的词”）。
export function codeDiff(wrong, right) {
  const a = sqlTokens(wrong), b = sqlTokens(right);
  if (a.length > 600 || b.length > 600) return null;
  const ia = a.map((t, i) => (/^\s+$/.test(t) ? -1 : i)).filter((i) => i >= 0);
  const ib = b.map((t, i) => (/^\s+$/.test(t) ? -1 : i)).filter((i) => i >= 0);
  const x = ia.map((i) => a[i].toLowerCase()), y = ib.map((i) => b[i].toLowerCase());
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Set(), keepB = new Set();
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { keepA.add(ia[i]); keepB.add(ib[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const lcs = dp[0][0];
  const changedA = x.length - lcs, changedB = y.length - lcs;
  if (!lcs || lcs < 0.4 * Math.min(x.length, y.length) || (!changedA && !changedB)) return null;
  const seg = (tokens, keep) => tokens.map((t, k) => ({ t, changed: !/^\s+$/.test(t) && !keep.has(k) }));
  return { wrong: seg(a, keepA), right: seg(b, keepB), changedWrong: changedA, changedRight: changedB };
}
// 取出常见错误卡里“错误代码”（正面）与“正确代码”（背面第一个标题含“修正”的代码，否则第一个代码块）。
export function errorPair(card) {
  if (card.type !== "error") return null;
  const wrong = card.front?.code;
  const sections = card.back?.sections || [];
  const index = sections.findIndex((s) => s.type === "code" && /修正|正确/.test(s.title || ""));
  const at = index >= 0 ? index : sections.findIndex((s) => s.type === "code");
  if (!wrong || at < 0) return null;
  const diff = codeDiff(wrong, sections[at].content);
  return diff ? { at, diff } : null;
}

// ---- 函数用法：把示例查询的 SELECT 列表拆成“输入 → 函数 → 输出”，输出取自卡片自己记录的预期结果 ----
function topLevel(sql, stops) {
  // 返回在括号、引号之外的各个分割位置
  const hits = [];
  let depth = 0, quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) { if (ch === quote) { if (sql[i + 1] === quote) i++; else quote = null; } continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && stops(sql, i)) hits.push(i);
  }
  return hits;
}
export function selectItems(sql) {
  const text = String(sql ?? "").trim().replace(/;\s*$/, "");
  if (!/^select\b/i.test(text)) return null;
  const body = text.slice(6);
  const from = topLevel(body, (s, i) => /^\s+from\b/i.test(s.slice(i)) && (i === 0 || /\s/.test(s[i]) ));
  const list = from.length ? body.slice(0, from[0]) : body;
  if (/^\s*(distinct|all)\b/i.test(list)) return null;
  const commas = topLevel(list, (s, i) => s[i] === ",");
  const parts = []; let last = 0;
  for (const c of commas) { parts.push(list.slice(last, c)); last = c + 1; }
  parts.push(list.slice(last));
  return parts.map((raw) => {
    let expr = raw.trim(), alias = null;
    const as = topLevel(expr, (s, i) => /^\s+as\s+[\w`"]+\s*$/i.test(s.slice(i)));
    if (as.length) { alias = expr.slice(as[0]).replace(/^\s+as\s+/i, "").replace(/[`"\s]/g, ""); expr = expr.slice(0, as[0]).trim(); }
    return { expr, alias };
  }).filter((x) => x.expr);
}
export function splitCall(expr) {
  const m = /^([A-Za-z_][\w]*)\s*\(([\s\S]*)\)$/.exec(expr.trim());
  if (!m) return null;
  // 括号必须在末尾才闭合，否则不是单个函数调用
  let depth = 0;
  const open = expr.indexOf("(");
  for (let i = open; i < expr.length; i++) { if (expr[i] === "(") depth++; else if (expr[i] === ")") { depth--; if (depth === 0 && i < expr.length - 1) return null; } }
  return { name: m[1], args: m[2].trim() };
}
export const showValue = (v) => (v === null ? "NULL" : typeof v === "string" ? `'${v}'` : String(v));
// 返回 { example, pairs:[{expr, alias, name, args, value}] }；没有可靠的一一对应时返回 null。
// 示例在应用的本地执行层里跑不出结果的卡（如 CEILING 未注册，只有 CEIL），其“调用 → 结果”无法在应用内核对，不画图；由 scripts/check-flashcard-figures.mjs 保证这个名单与实际一致。
export const FIGURE_UNVERIFIABLE = new Set(["fc2-0174"]);
export function callPairs(card) {
  if (card.type !== "function" || FIGURE_UNVERIFIABLE.has(card.id)) return null;
  const list = Array.isArray(card.examples) && card.examples.length ? card.examples : card.example ? [card.example] : [];
  for (const ex of list) {
    const sql = ex.mysqlSql || ex.sql || ex.sqliteSql;
    const exp = ex.expected;
    if (!sql || !exp || !Array.isArray(exp.rows) || exp.rows.length !== 1 || ex.expectedError) continue;
    const items = selectItems(sql);
    if (!items || items.length !== exp.columns.length || items.length < 1) continue;
    const pairs = items.map((it, i) => ({ ...it, call: splitCall(it.expr), value: exp.rows[0][i], column: exp.columns[i] }));
    if (!pairs.some((p) => p.call)) continue;
    return { example: ex, pairs: pairs.slice(0, 5), total: pairs.length };
  }
  return null;
}

// ---- 语法结构：把语法模板按子句分块，并标出每块的作用（子句含义是 SQL 的固定定义，不新增卡片没有的知识）----
const CLAUSES = [
  ["INSERT INTO", "insert", "往哪张表的哪些列插入"], ["DELETE FROM", "delete", "从哪张表删除"], ["CREATE TABLE", "create", "新建表及列定义"], ["CREATE VIEW", "create", "新建视图（保存一条查询）"],
  ["GROUP BY", "group", "按哪些列分组"], ["ORDER BY", "order", "按什么排序"],
  ["SELECT", "select", "要显示的列或表达式"], ["FROM", "from", "数据来自哪张表"], ["WHERE", "where", "筛选行：条件为真的才保留"], ["HAVING", "having", "对分组后的结果再筛选"],
  ["LIMIT", "limit", "最多取几行"], ["OFFSET", "limit", "先跳过几行"], ["JOIN", "join", "连接另一张表"], ["ON", "join", "两张表怎样配对"],
  ["WITH RECURSIVE", "with", "给中间结果起名字（可自己引用自己）"], ["CASE", "case", "开始条件分支"], ["WHEN", "case", "如果这个条件成立"], ["THEN", "case", "就返回这个结果"], ["ELSE", "case", "都不成立时返回的默认值"], ["END", "case", "结束分支"], ["WITH", "with", "给中间结果起名字"], ["UPDATE", "update", "要修改哪张表"], ["SET", "update", "改成什么值"], ["VALUES", "insert", "插入的值"],
  ["BETWEEN", "pred", "在范围内（含两个端点）"], ["IN", "pred", "在这组候选值里"], ["LIKE", "pred", "文本符合模式（% 任意长度，_ 一个字符）"], ["REGEXP", "pred", "文本符合正则模式"], ["IS", "pred", "判断是不是 NULL"],
];
export function syntaxChunks(template) {
  const text = String(template ?? "").trim().replace(/;\s*$/, "");
  if (!text || /;/.test(text)) return null;
  const hits = [];
  let depth = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0 || (i > 0 && /[\w$]/.test(text[i - 1]))) continue;
    for (const [kw, family, role] of CLAUSES) {
      const re = new RegExp("^" + kw.replace(" ", "\\s+") + "(?![\\w$])", "i");
      const m = re.exec(text.slice(i));
      if (m) { hits.push({ at: i, keyword: m[0].replace(/\s+/g, " ").toUpperCase(), family, role }); i += m[0].length - 1; break; }
    }
  }
  if (hits.length < 2 || hits[0].at !== 0) return null;
  // 去掉 JOIN 前面的 INNER/LEFT/RIGHT 等修饰词归属：它们留在上一块末尾会误导，所以并入 JOIN 块
  const chunks = hits.map((h, k) => ({ ...h, end: k + 1 < hits.length ? hits[k + 1].at : text.length }));
  for (let k = 1; k < chunks.length; k++) {
    if (chunks[k].family !== "join" || chunks[k].keyword !== "JOIN") continue;
    const prev = chunks[k - 1];
    const slice = text.slice(prev.at, prev.end);
    const mm = /(?:^|\s)((?:INNER|LEFT|RIGHT|FULL|CROSS)(?:\s+OUTER)?)\s*$/i.exec(slice);
    if (mm) { const start = prev.at + mm.index + mm[0].indexOf(mm[1]); prev.end = start; chunks[k].at = start; chunks[k].keyword = mm[1].replace(/\s+/g, " ").toUpperCase() + " JOIN"; }
  }
  return chunks.map((c) => ({ keyword: c.keyword, family: c.family, role: c.role, text: text.slice(c.at, c.end).trim() }));
}

// ---- 概念辨析：把“列相同”的几个示例结果并排放在一起，标出只出现在某一种写法里的行 ----
export function compareResults(card) {
  if (card.type !== "comparison") return null;
  const sections = card.back?.sections || [];
  const results = [];
  sections.forEach((s, i) => { if (s.type === "table" && i > 0 && sections[i - 1].type === "code" && Array.isArray(s.columns) && Array.isArray(s.rows)) results.push({ index: i, code: sections[i - 1], table: s }); });
  const bySignature = new Map();
  for (const r of results) { const key = JSON.stringify(r.table.columns); if (!bySignature.has(key)) bySignature.set(key, []); bySignature.get(key).push(r); }
  const best = [...bySignature.values()].sort((a, b) => b.length - a.length || a[0].index - b[0].index)[0];
  if (!best || best.length < 2) return null;
  const group = best.slice(0, 3);
  if (group.some((r) => r.table.rows.length > 8 || !r.table.rows.length)) return null;
  const key = (row) => JSON.stringify(row);
  const sets = group.map((r) => new Set(r.table.rows.map(key)));
  const tables = group.map((r, k) => ({
    title: String(r.code.title || "").replace(/\s*[·:：]\s*(结果|查询结果)\s*$/, "") || `写法 ${k + 1}`,
    sql: r.code.content,
    columns: r.table.columns,
    rows: r.table.rows.map((row) => ({ row, only: sets.some((set, other) => other !== k && !set.has(key(row))) })),
  }));
  const anyOnly = tables.some((t) => t.rows.some((r) => r.only));
  if (!anyOnly) return null; // 几种写法结果完全相同，并排没有额外信息
  return { at: group[group.length - 1].index, tables };
}

// ---- 业务指标：把示例结果的第一行“代入”公式（分子 ÷ 分母 × 100%）----
// 只有同时满足三件事才画：①示例 SQL 的最后一个 SELECT 里，某一列是 分子/分母（可带 ×100、ROUND、NULLIF、COALESCE、CASE）；
// ②分子、分母能一一对应到同一结果表里的其他列（按列名或同样的表达式）；③用这一行的数字重新算一遍，与该列记录的值一致（容差为四舍五入）。
function finalSelect(sql) {
  const text = String(sql ?? "").trim().replace(/;\s*$/, "");
  if (/^select\b/i.test(text)) return text;
  const hits = topLevel(text, (s, i) => /^select\b/i.test(s.slice(i)) && (i === 0 || !/[\w$]/.test(s[i - 1])));
  return hits.length ? text.slice(hits[hits.length - 1]) : null;
}
const clean = (expr) => {
  let s = String(expr).trim();
  for (let n = 0; n < 6; n++) {
    const before = s;
    s = s.replace(/^ROUND\(([\s\S]*),\s*\d+\)$/i, "$1").replace(/^CASE\s+WHEN[\s\S]*?\sTHEN\s([\s\S]*?)\s+(?:ELSE[\s\S]*?\s+)?END$/i, "$1")
      .replace(/^NULLIF\(([\s\S]*),\s*0\)$/i, "$1").replace(/^COALESCE\(([\s\S]*?),\s*0\)$/i, "$1").replace(/^\(([\s\S]*)\)$/, "$1").trim();
    if (s === before) break;
  }
  return s.replace(/\b[a-z_]\w*\./gi, "");
};
const norm = (x) => clean(x).replace(/\s+/g, "").toLowerCase();
function splitDivision(expr) {
  const body = clean(expr);
  const slashes = topLevel(body, (s, i) => s[i] === "/");
  if (slashes.length !== 1) return null;
  let top = body.slice(0, slashes[0]).trim(), bottom = body.slice(slashes[0] + 1).trim();
  let factor = 1;
  const strip = (side) => { let t = side; const m = /^(?:100(?:\.0)?\s*\*\s*)([\s\S]+)$/.exec(t) || /^([\s\S]+?)\s*\*\s*100(?:\.0)?$/.exec(t); if (m) { factor *= 100; t = m[1]; } t = t.replace(/^1\.0\s*\*\s*/, "").replace(/\s*\*\s*1\.0$/, ""); return clean(t); };
  top = strip(top); bottom = strip(bottom);
  return top && bottom ? { top, bottom, factor } : null;
}
export function metricSubstitution(card) {
  if (card.type !== "metric") return null;
  const sections = card.back?.sections || [];
  const formulas = formulaLines(sections.find((s) => s.type === "text" && /公式/.test(s.title))?.content);
  const fractions = formulas.map(parseFormula).filter((f) => f.fraction);
  for (let i = 0; i + 1 < sections.length; i++) {
    const code = sections[i], result = sections[i + 1];
    if (code.type !== "code" || result.type !== "table" || isAlt(code.title)) continue;
    const select = finalSelect(code.content);
    const items = select ? selectItems(select) : null;
    if (!items || items.length !== result.columns.length) continue;
    const exprOf = new Map(items.map((it, k) => [norm(it.expr), k]));
    const colOf = new Map(result.columns.map((c, k) => [String(c).toLowerCase(), k]));
    for (let t = 0; t < items.length; t++) {
      const div = splitDivision(items[t].expr);
      if (!div) continue;
      const find = (side) => { const key = side.replace(/\s+/g, "").toLowerCase(); if (colOf.has(key) && colOf.get(key) !== t) return colOf.get(key); if (exprOf.has(key) && exprOf.get(key) !== t) return exprOf.get(key); return null; };
      const ni = find(div.top), di = find(div.bottom);
      if (ni === null || di === null || ni === di) continue;
      for (const row of result.rows) {
        const [a, b, v] = [row[ni], row[di], row[t]];
        if (![a, b, v].every((x) => typeof x === "number") || b === 0) continue;
        const calc = (a / b) * div.factor;
        if (Math.abs(calc - v) > Math.max(0.0051, Math.abs(v) * 1e-6)) continue; // 重算必须与记录一致
        return { label: String(code.title).replace(/\s*[·:：]\s*(查询代码)\s*$/, ""), top: { column: result.columns[ni], value: a }, bottom: { column: result.columns[di], value: b }, factor: div.factor, target: { column: result.columns[t], value: v }, formula: fractions.length === 1 ? fractions[0].fraction : null };
      }
    }
  }
  return null;
}
