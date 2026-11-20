// 332 张统一闪卡（resources/CONTENT/flashcard_v2/cards.json）的只读适配层。
// 原始对象不被修改：normalizeCard 返回浅拷贝并追加派生字段，所有原字段（含未知字段）原样保留。
export const TIER_ORDER = ["面试必学", "面试进阶", "知识拓展"];
export const TYPE_ORDER = ["concept", "comparison", "syntax", "function", "error", "logic", "query", "metric"];
export const TYPE_LABELS = {
  concept: "核心概念",
  comparison: "用法辨析",
  syntax: "语法结构",
  function: "函数用法",
  error: "常见错误",
  logic: "执行逻辑",
  query: "查询思路",
  metric: "业务指标",
};
// 原插画文件名 → 打包后的 ASCII 资源名（resources/ASSETS/flashcards/<key>.png）
export const ILLUSTRATION_KEYS = {
  "原版海岛插画.png": "island",
  "原版执行逻辑海岛插画.png": "logic",
  "原版错误卡海岛插画.png": "error",
  "原项目灯塔插画.png": "lighthouse",
  "原项目零售插画.png": "retail",
  "代码插画.png": "code",
};
// 函数用法卡原对象无显式插画引用；用户已确认使用「代码插画」（2026-11-20）。
const FUNCTION_DEFAULT_ILLUSTRATION = "code";

const keyOf = (fileName) => ILLUSTRATION_KEYS[String(fileName || "").split("/").pop()] || null;

// 兼容两种合并字段：interviewMergedFrom（数组，219 张）与 interviewRevision.mergedFrom（113 张）。
export function mergedFromOf(raw) {
  const ids = [];
  const push = (list) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const id = typeof item === "string" ? item : item?.id;
      if (id && !ids.includes(id)) ids.push(id);
    }
  };
  push(raw.interviewMergedFrom);
  push(raw.interviewRevision?.mergedFrom);
  return ids;
}

// 打包副本去掉各示例中的 actual（宿主执行记录，界面不使用）；源文件不改。
function slimExample(example) {
  if (!example || typeof example !== "object") return example;
  const { actual, ...rest } = example;
  return rest;
}

export function normalizeCard(raw, illustrationMap = {}, { slim = false } = {}) {
  const mapped = illustrationMap[raw.id];
  const illustration =
    keyOf(raw.front?.illustration) ||
    keyOf(mapped) ||
    (raw.type === "function" ? FUNCTION_DEFAULT_ILLUSTRATION : null);
  const chapterIds = Array.isArray(raw.chapterIds) ? raw.chapterIds : [];
  const card = {
    ...raw,
    // 以下为派生字段，不覆盖任何原字段。
    chapterId: chapterIds[0] || "",
    tags: [raw.typeLabel || TYPE_LABELS[raw.type] || "", raw.interviewTier || ""].filter(Boolean),
    mergedFrom: mergedFromOf(raw),
    illustrationKey: illustration,
    front: { ...raw.front, question: raw.front?.prompt ?? "" },
  };
  if (slim) {
    if (card.example) card.example = slimExample(card.example);
    if (Array.isArray(card.examples)) card.examples = card.examples.map(slimExample);
  }
  return card;
}

export function normalizeCards(source, illustrationMap = {}, options = {}) {
  return (source.cards || []).map((card) => normalizeCard(card, illustrationMap, options));
}
