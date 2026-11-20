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
