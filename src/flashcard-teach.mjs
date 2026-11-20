// 闪卡“教学图解”数据的结构与数值核对（纯函数，无 DOM）。
// 图解数据放在 resources/CONTENT/flashcard_v2/teaching-figures.json，按卡号索引，不改 332 张卡的原始内容。
// 核对规则：图里每个数值都必须出现在这张卡自己的文字/表格里，或在 spec.derived 里明确登记为“由卡内数字算出”；
// 计算块的每一步都会重新算一遍，必须与图上写的结果一致。
export const BLOCK_TYPES = ["calc", "table", "compare", "chunks", "steps", "bars", "note", "flow", "pairs", "matrix"];

const DATE = /\d{4}-\d{2}-\d{2}/g;
const NUM = /\d+(?:\.\d+)?/g;

export function cardText(card) {
  const parts = [card.front?.prompt ?? "", card.back?.answer ?? ""];
  for (const s of card.back?.sections || []) {
    parts.push(s.title ?? "", s.content ?? "");
    for (const r of s.rows || []) parts.push(r.map((v) => (v === null ? "" : String(v))).join(" "));
    for (const c of s.columns || []) parts.push(String(c));
    for (const n of s.nodes || []) parts.push(n.label ?? "");
  }
  for (const ex of card.examples?.length ? card.examples : card.example ? [card.example] : []) {
    parts.push(ex.setupSql ?? "", ex.sql ?? "", ex.sqliteSql ?? "", ex.mysqlSql ?? "", ex.label ?? "");
  }
  return parts.join("\n");
}

// 千分位逗号既可能是“1,200”（一个数），也可能是代码里的“(1,100,'A')”（两个数），所以卡片原文两种读法都收。
export function tokens(text) {
  const raw = String(text ?? "");
  const merged = raw.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const dates = merged.match(DATE) || [];
  const numbers = [...(merged.replace(DATE, " ").match(NUM) || []), ...(raw.replace(DATE, " ").match(NUM) || [])];
  return { dates, numbers };
}

const cellsOf = (block) => {
  switch (block.type) {
    case "calc": return block.lines.filter((l) => typeof l.value === "number").map((l) => String(Math.abs(l.value)));
    case "table": return [...(block.rows || []), ...(block.foot ? [block.foot] : [])].flat().map((v) => (v === null || v === undefined ? "" : String(v)));
    case "compare": return (block.rows || []).flat().map((v) => (typeof v === "object" && v ? v.t : String(v ?? "")));
    case "bars": return block.items.map((i) => String(i.value));
    case "matrix": return (block.rows || []).flat().map((v) => (typeof v === "object" && v ? v.t : String(v ?? "")));
    case "pairs": return block.items.flatMap((i) => [i.left, i.right]).map((v) => String(v ?? ""));
    case "flow": return block.items.flatMap((i) => (i.table ? i.table.rows.flat() : [])).map((v) => (v === null ? "" : String(v)));
    default: return [];
  }
};

const close = (a, b, tol) => Math.abs(a - b) <= tol;

function checkCalc(block, where, errors) {
  let running = null;
  let pendingZero = false;
  block.lines.forEach((line, i) => {
    const at = `${where} 行${i + 1}`;
    if (i === 0) {
      if (line.op) errors.push(`${at}: 第一行不应有运算符`);
      if (typeof line.value !== "number") errors.push(`${at}: 第一行需要数值`);
      running = line.value;
      return;
    }
    if (!["+", "−", "×", "÷", "="].includes(line.op)) { errors.push(`${at}: 运算符无效 ${line.op}`); return; }
    if (line.op === "=") {
      if (typeof line.value !== "number") {
        if (!(pendingZero && line.text)) errors.push(`${at}: “=”行没有数值，只允许出现在除以 0 之后并写明原因`);
        return;
      }
      const tol = line.approx ? 0.005 : 1e-9;
      if (!close(running, line.value, tol)) errors.push(`${at}: 图上写 ${line.value}，实际算出 ${running}`);
      running = line.value;
      return;
    }
    if (typeof line.value !== "number") { errors.push(`${at}: 需要数值`); return; }
    if (line.op === "+") running += line.value;
    if (line.op === "−") running -= line.value;
    if (line.op === "×") running *= line.value;
    if (line.op === "÷") { if (line.value === 0) pendingZero = true; else running /= line.value; }
  });
}

export function validateFigure(id, spec, card) {
  const errors = [];
  const where = id;
  if (!card) return [`${where}: 找不到这张卡`];
  if (!spec || typeof spec !== "object") return [`${where}: 图解数据不是对象`];
  if (!spec.title) errors.push(`${where}: 缺少 title`);
  if (!Array.isArray(spec.blocks) || !spec.blocks.length) errors.push(`${where}: 没有 blocks`);
  const text = cardText(card);
  const known = tokens(text);
  const allowed = new Set([...known.numbers, ...(spec.derived || []).map(String)]);
  const allowedDates = new Set(known.dates);
  (spec.blocks || []).forEach((block, bi) => {
    const w = `${where} 块${bi + 1}(${block.type})`;
    if (!BLOCK_TYPES.includes(block.type)) { errors.push(`${w}: 未知块类型`); return; }
    if (block.type === "calc") { if (!Array.isArray(block.lines) || block.lines.length < 2) errors.push(`${w}: 计算块至少两行`); else checkCalc(block, w, errors); }
    if (block.type === "table" && !(Array.isArray(block.columns) && Array.isArray(block.rows))) errors.push(`${w}: 表格缺少 columns/rows`);
    if (block.type === "compare" && !(Array.isArray(block.heads) && Array.isArray(block.rows))) errors.push(`${w}: 对比缺少 heads/rows`);
    if (block.type === "chunks" && !(Array.isArray(block.items) && block.items.every((c) => c.role && c.text))) errors.push(`${w}: 语法块缺少 role/text`);
    if (block.type === "steps" && !(Array.isArray(block.items) && block.items.every((c) => c.title))) errors.push(`${w}: 步骤缺少 title`);
    if (block.type === "bars" && !(Array.isArray(block.items) && block.items.every((c) => c.label && typeof c.value === "number"))) errors.push(`${w}: 占比条缺少 label/value`);
    if (block.type === "note" && !block.text) errors.push(`${w}: 缺少 text`);
    if (["calc", "table", "compare", "bars", "matrix", "pairs", "flow"].includes(block.type) && Array.isArray(block.lines || block.rows || block.items)) {
      for (const cell of cellsOf(block)) {
        const t = tokens(cell);
        for (const d of t.dates) if (!allowedDates.has(d) && !allowed.has(d)) errors.push(`${w}: 日期 ${d} 不在卡片内容里`);
        for (const n of t.numbers) if (!allowed.has(n) && !allowed.has(String(Number(n)))) errors.push(`${w}: 数值 ${n} 既不在卡片内容里，也没有登记为 derived`);
      }
    }
  });
  return errors;
}

export function validateAll(figuresFile, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const errors = [];
  for (const [id, spec] of Object.entries(figuresFile.figures || {})) errors.push(...validateFigure(id, spec, byId.get(id)));
  return errors;
}
