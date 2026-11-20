// 332 张闪卡的手机端双面展示。只读渲染：按 section.type 分派，未知类型原样兜底，不改卡片数据。
// 由 app.js 注入 e / table / code / tag，避免与 app.js 循环依赖。
import { TYPE_LABELS } from "./flashcard-model.mjs";
import { mergeTimeline, groupRuns, runTitle, isAlt, parseFormula, formulaLines, scopeItems } from "./flashcard-blocks.mjs";

// 八类模板差异：正面是否带代码、背面图示的呈现方式、待确认标记。
export const CARD_TEMPLATES = {
  concept: { frontCode: false, flow: "map" },
  comparison: { frontCode: false, flow: "map" },
  syntax: { frontCode: false, flow: "map" },
  function: { frontCode: false, flow: "map" },
  error: { frontCode: true, flow: "map", tone: true },
  logic: { frontCode: true, flow: "steps" },
  query: { frontCode: false, flow: "steps", compose: "query" },
  metric: { frontCode: false, flow: "map", compose: "metric" },
};

export function createCardView({ e, table, code, tag }) {
  const paragraphs = (text) =>
    String(text ?? "")
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line) => `<p>${e(line)}</p>`)
      .join("");
  const heading = (title) => `<h3 class="fc-h"><i></i>${e(title)}</h3>`;

  function diagram(section, flow) {
    const nodes = section.nodes || [];
    const edges = section.edges || [];
    const label = new Map(nodes.map((n) => [String(n.id), n.label]));
    const outs = new Map();
    const ins = new Map();
    for (const edge of edges) {
      outs.set(String(edge.from), (outs.get(String(edge.from)) || 0) + 1);
      ins.set(String(edge.to), (ins.get(String(edge.to)) || 0) + 1);
    }
    const chain =
      edges.length === nodes.length - 1 &&
      [...outs.values()].every((n) => n === 1) &&
      [...ins.values()].every((n) => n === 1);
    let body;
    if (chain) {
      const next = new Map(edges.map((x) => [String(x.from), x]));
      const first = nodes.find((n) => !ins.has(String(n.id))) || nodes[0];
      const ordered = [];
      let current = first && { node: first, via: null };
      const seen = new Set();
      while (current && !seen.has(String(current.node.id))) {
        seen.add(String(current.node.id));
        ordered.push(current);
        const edge = next.get(String(current.node.id));
        const target = edge && nodes.find((n) => String(n.id) === String(edge.to));
        current = target ? { node: target, via: edge.label } : null;
      }
      body = ordered
        .map(
          (item, i) =>
            `${item.via ? `<div class="fc-arrow"><span>${e(item.via)}</span></div>` : i ? '<div class="fc-arrow"></div>' : ""}<div class="fc-node">${flow === "steps" ? `<b>${i + 1}</b>` : ""}<span>${e(item.node.label)}</span></div>`,
        )
        .join("");
    } else {
      const groups = new Map();
      for (const edge of edges) {
        if (!groups.has(String(edge.from))) groups.set(String(edge.from), []);
        groups.get(String(edge.from)).push(edge);
      }
      body = [...groups.entries()]
        .map(
          ([from, list]) =>
            `<div class="fc-branch"><div class="fc-node"><span>${e(label.get(from) ?? from)}</span></div><div class="fc-kids">${list.map((edge) => `<div class="fc-kid"><small>${e(edge.label || "")}</small><div class="fc-node"><span>${e(label.get(String(edge.to)) ?? edge.to)}</span></div></div>`).join("")}</div></div>`,
        )
        .join("");
    }
    return `<section class="fc-sec fc-diagram fc-f-${flow}">${heading(section.title)}<div class="fc-flow">${body}</div></section>`;
  }

  function section(s, template) {
    switch (s.type) {
      case "text":
        return `<section class="fc-sec fc-text${/公式/.test(s.title) ? " fc-formula" : ""}">${heading(s.title)}${paragraphs(s.content)}</section>`;
      case "application":
        return `<section class="fc-sec fc-text">${heading(s.title)}${paragraphs(s.content)}</section>`;
      case "note":
        return `<section class="fc-sec fc-note">${heading(s.title)}${paragraphs(s.content)}</section>`;
      case "syntax":
        return `<section class="fc-sec fc-syntax">${heading(s.title)}<div class="fc-code">${code(s.content)}</div></section>`;
      case "code": {
        const tone = !template.tone ? "" : /错误|不要|易错|误/.test(s.title) ? " bad" : /正确|推荐|改写/.test(s.title) ? " good" : "";
        return `<section class="fc-sec fc-codeblock${tone}">${heading(s.title)}<div class="fc-code">${code(s.content)}</div></section>`;
      }
      case "table":
        return `<section class="fc-sec fc-table">${heading(s.title)}${table(s.columns || [], s.rows || [], 60)}</section>`;
      case "diagram":
        return diagram(s, template.flow);
      default:
        // 未知类型不丢弃：标题 + 原文字段
        return `<section class="fc-sec fc-text">${heading(s.title || s.type)}${paragraphs(s.content ?? "")}</section>`;
    }
  }


  // ---- 查询思路 / 业务指标：共用代码、表格、分组组件，各自保留原栏目顺序 ----
  const codeBox = (sql) => `<div class="fc-code fc-scroll">${code(sql)}</div>`;
  function timeline(title, steps) {
    return `<section class="fc-sec fc-timeline">${heading(title)}<ol>${steps.map((step, i) => `<li><b>${i + 1}</b><div><strong>${e(step.title)}</strong>${step.detail ? `<p>${e(step.detail)}</p>` : ""}</div></li>`).join("")}</ol></section>`;
  }
  function formulaCard(s) {
    const items = formulaLines(s.content).map((line) => {
      const f = parseFormula(line);
      const body = f.fraction
        ? `<span class="fc-frac"><span class="top">${e(f.fraction.top)}</span><span class="bar"></span><span class="bottom">${e(f.fraction.bottom)}</span></span>${f.fraction.suffix ? `<span class="fc-times">${e(f.fraction.suffix)}</span>` : ""}`
        : `<span class="fc-line">${e(f.expr)}</span>`;
      return `<div class="fc-eq">${f.name ? `<span class="fc-eq-name">${e(f.name)}</span><span class="fc-eq-sign">＝</span>` : ""}${body}</div>`;
    });
    return `<section class="fc-sec fc-formula-card">${heading(s.title)}${items.join("")}</section>`;
  }
  function scopeCard(s) {
    return `<section class="fc-sec fc-scope">${heading(s.title)}<ul>${scopeItems(s.content).map((t) => `<li>${e(t)}</li>`).join("")}</ul></section>`;
  }
  function altBlock(c, card) {
    const detail = card.compatibility?.detail;
    return `<details class="fc-alt"><summary>${e(c.title)}<small>仅供本地 SQLite 运行</small></summary><div class="fc-alt-note"><p>原 MySQL 8.4 写法在本地 SQLite 中不能原样执行，这是为本地运行改写的版本，不代表原生 MySQL 的结果。</p>${detail ? `<p>本卡兼容说明：${e(detail)}</p>` : ""}</div>${codeBox(c.content)}</details>`;
  }
  function runGroup(run, title, card) {
    const body = run.codes.map((c) => (isAlt(c.title) ? altBlock(c, card) : `<div class="fc-sub">参考代码</div>${codeBox(c.content)}`)).join("");
    return `<section class="fc-sec fc-group"><h3 class="fc-group-h">${e(title)}</h3>${body}<div class="fc-sub">${e(/结果/.test(run.result.title) ? "查询结果" : run.result.title)}</div>${table(run.result.columns || [], run.result.rows || [], 60)}</section>`;
  }
  function composeBack(card, template) {
    let sections = (card.back?.sections || []).slice();
    const parts = [];
    if (template.compose === "query") {
      const ti = sections.findIndex((x) => x.type === "text" && /思路/.test(x.title));
      const di = sections.findIndex((x) => x.type === "diagram");
      const steps = ti >= 0 && di >= 0 ? mergeTimeline(sections[ti], sections[di]) : null;
      if (steps) {
        sections = sections.map((x, i) => (i === ti ? { __timeline: steps, title: "查询思路" } : x)).filter((_, i) => i !== di);
      }
    }
    const entries = groupRuns(sections);
    const total = entries.filter((x) => x.kind === "run").length;
    let n = 0;
    for (const entry of entries) {
      if (entry.kind === "run") {
        n++;
        parts.push(runGroup(entry, runTitle(entry, total > 1 ? `示例 ${n}` : "代码与结果"), card));
        continue;
      }
      const x = entry.section;
      if (x.__timeline) parts.push(timeline(x.title, x.__timeline));
      else if (template.compose === "metric" && x.type === "text" && /公式/.test(x.title)) parts.push(formulaCard(x));
      else if (template.compose === "metric" && x.type === "text" && /口径/.test(x.title)) parts.push(scopeCard(x));
      else if (x.type === "code" && isAlt(x.title)) parts.push(altBlock(x, card));
      else parts.push(section(x, template));
    }
    return parts.join("");
  }

  const art = (card) => (card.illustrationKey ? `<img class="fc-art" src="assets/flashcards/${card.illustrationKey}.png" alt="">` : "");

  // 卡片外的标签行：类别 · 级别（一行，不重复）。
  function meta(card) {
    return `<div class="fc-meta">${tag(card.typeLabel || TYPE_LABELS[card.type] || "")}${card.interviewTier ? tag(card.interviewTier, "soft") : ""}</div>`;
  }

  function front(card) {
    const template = CARD_TEMPLATES[card.type] || CARD_TEMPLATES.concept;
    const codeBlock = card.front?.code ? `<div class="fc-code fc-front-code${card.type === "error" ? " bad" : ""}">${code(card.front.code)}</div>` : "";
    return `${meta(card)}<article class="fc fc-${card.type} front" aria-label="正面"><div class="fc-prompt">${e(card.front?.prompt ?? card.front?.question ?? "")}</div>${template.frontCode ? codeBlock : ""}${art(card)}</article>`;
  }

  function back(card, extra = "") {
    const template = CARD_TEMPLATES[card.type] || CARD_TEMPLATES.concept;
    return `<article class="fc fc-${card.type} back" aria-label="背面"><h2 class="fc-title">${e(card.front?.prompt ?? "")}</h2><div class="fc-answer">${paragraphs(card.back?.answer)}</div>${template.compose ? composeBack(card, template) : (card.back?.sections || []).map((s) => section(s, template)).join("")}${extra}</article>`;
  }

  return { front, back, meta };
}
