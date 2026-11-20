// 332 张闪卡的手机端双面展示。只读渲染：按 section.type 分派，未知类型原样兜底，不改卡片数据。
// 由 app.js 注入 e / table / code / tag，避免与 app.js 循环依赖。
import { TYPE_LABELS } from "./flashcard-model.mjs";
import { mergeTimeline, groupRuns, runTitle, isAlt, parseFormula, formulaLines, scopeItems, errorPair, callPairs, showValue, syntaxChunks, compareResults, metricSubstitution } from "./flashcard-blocks.mjs";

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
    const sub = metricSubstitution(card);
    if (sub) {
      let at = -1;
      parts.forEach((x, i) => { if (/fc-(scope|formula-card)/.test(x.slice(0, 80))) at = i; });
      parts.splice(at + 1, 0, substFigure(sub));
    }
    const data = dataFigure(card);
    if (data) {
      const first = parts.findIndex((x) => /^<section class="fc-sec (fc-group|fc-codeblock)/.test(x));
      parts.splice(first >= 0 ? first : parts.length, 0, data);
    }
    return parts.join("");
  }


  // ---- 闪卡教学图示（只用卡片自己的数据计算，放在背面答案/解析之后）----
  const diffSide = (segments) => segments.map((x) => (x.changed ? `<mark>${e(x.t)}</mark>` : e(x.t))).join("");
  function codeDiffFigure(diff) {
    return `<section class="fc-sec fc-fig fc-diff"><h3 class="fc-h"><i></i>错在哪里：两种写法的差别</h3><div class="fc-diff-side bad"><small>错误写法（正面）</small><pre><code>${diffSide(diff.wrong)}</code></pre></div><div class="fc-diff-side good"><small>正确写法</small><pre><code>${diffSide(diff.right)}</code></pre></div><p class="fc-hint">高亮的是两种写法不一样的地方${diff.changedWrong ? "" : "：错误写法里的每个词在正确写法里都有，差别在于正确写法多出来的部分"}。</p></section>`;
  }
  function callFigure(found) {
    const rows = found.pairs.map((p) => `<div class="fc-call"><div class="fc-call-in">${p.call ? `<span class="fc-fn">${e(p.call.name)}</span><span class="fc-args"><small>输入</small><code>${e(p.call.args || "（无参数）")}</code></span>` : `<span class="fc-args"><small>表达式</small><code>${e(p.expr)}</code></span>`}</div><div class="fc-call-out"><span>↓ 输出${p.alias ? `<small>${e(p.alias)}</small>` : ""}</span><b>${e(showValue(p.value))}</b></div></div>`).join("");
    return `<section class="fc-sec fc-fig fc-calls"><h3 class="fc-h"><i></i>输入 → 函数 → 输出${found.example.label ? `：${e(found.example.label)}` : ""}</h3>${rows}${found.total > found.pairs.length ? `<p class="fc-hint">这个示例共有 ${found.total} 列，这里只列出前 ${found.pairs.length} 个。</p>` : ""}</section>`;
  }
  function chunkFigure(chunks) {
    return `<section class="fc-sec fc-fig fc-chunks"><h3 class="fc-h"><i></i>语法分块：每一部分管什么</h3>${chunks.map((c) => `<div class="fc-chunk k-${c.family}"><span class="fc-chunk-role">${e(c.role)}</span><code>${e(c.text)}</code></div>`).join("")}</section>`;
  }
  function compareFigure(cmp) {
    const cell = (v) => (v === null ? '<span class="muted">NULL</span>' : e(v));
    return `<section class="fc-sec fc-fig fc-cmp"><h3 class="fc-h"><i></i>同样的数据，不同写法的结果</h3>${cmp.tables.map((t) => `<div class="fc-cmp-t"><h4>${e(t.title)}</h4><div class="table-wrap"><table><thead><tr>${t.columns.map((c) => `<th>${e(c)}</th>`).join("")}<th></th></tr></thead><tbody>${t.rows.map((r) => `<tr class="${r.only ? "only" : ""}">${r.row.map((v) => `<td>${cell(v)}</td>`).join("")}<td>${r.only ? '<span class="fc-only">只在这里</span>' : ""}</td></tr>`).join("")}</tbody></table></div></div>`).join("")}<p class="fc-hint">黄色的行，只在这一种写法的结果里出现。</p></section>`;
  }
  // ---- 示例数据：卡片没有“数据示例”表时，把示例 setupSql 建出的表放在代码之前（构建时由应用引擎实际执行得到）----
  function dataFigure(card) {
    const sets = card.dataSets;
    if (!sets?.length) return "";
    const tables = (set) => set.tables.map((t) => `<div class="fc-data-t"><h4>${e(t.name)}<small>${t.rowCount} 行</small></h4>${table(t.columns, t.rows, 30)}</div>`).join("");
    const body = sets.length === 1
      ? tables(sets[0])
      : sets.map((set, i) => `<details class="fc-data-set"${i === 0 ? " open" : ""}><summary>${set.labels.length ? "用于：" + e(set.labels.join("、")) : "示例数据 " + (i + 1)}</summary>${tables(set)}</details>`).join("");
    return `<section class="fc-sec fc-fig fc-data"><h3 class="fc-h"><i></i>示例数据<small>下面的代码在这些数据上运行</small></h3>${body}</section>`;
  }
  function substFigure(sub) {
    const fmt = (v) => String(v);
    const row = (kind, text, col, val) => `<div class="fc-sub-row ${kind}"><span class="fc-sub-k">${e(kind === "top" ? "分子" : "分母")}${text ? `<small>${e(text)}</small>` : ""}</span><span class="fc-sub-v"><small>${e(col)}</small><b>${e(fmt(val))}</b></span></div>`;
    return `<section class="fc-sec fc-fig fc-subst"><h3 class="fc-h"><i></i>代入示例数字<small>${e(sub.label)} · 结果的第一行有效数据</small></h3>${row("top", sub.formula?.top, sub.top.column, sub.top.value)}<div class="fc-sub-op">÷</div>${row("bottom", sub.formula?.bottom, sub.bottom.column, sub.bottom.value)}${sub.factor !== 1 ? `<div class="fc-sub-op">× ${e(sub.factor)}${sub.factor === 100 ? "（换成百分数）" : ""}</div>` : ""}<div class="fc-sub-row res"><span class="fc-sub-k">结果</span><span class="fc-sub-v"><small>${e(sub.target.column)}</small><b>${e(fmt(sub.target.value))}</b></span></div></section>`;
  }
  // ---- 教学图解（teaching-figures.json，按卡号挂在 card.teach 上；图里的数字已在构建/测试里与卡片原文核对）----
  const fmtNum = (v) => {
    const n = Number(v);
    const body = Math.abs(n) >= 1000 && Number.isInteger(n) ? Math.abs(n).toLocaleString("en-US") : String(Math.abs(n));
    return (n < 0 ? "−" : "") + body;
  };
  const cellHtml = (v) => {
    if (v === null || v === undefined) return '<span class="muted">NULL</span>';
    if (typeof v === "object") return `<span class="fc-tf-cell ${v.tone ? "t-" + e(v.tone) : ""}">${e(v.t)}</span>`;
    return e(v);
  };
  const tfTitle = (b) => (b.title ? `<h4 class="fc-tf-sub">${e(b.title)}</h4>` : "");
  const tfBlocks = {
    calc: (b) => `<div class="fc-tf-calc">${tfTitle(b)}${b.lines.map((l, i) => {
      const last = l.op === "=" && i === b.lines.length - 1;
      const val = typeof l.value === "number" ? `<b>${l.approx ? "≈ " : ""}${e(fmtNum(l.value))}${l.unit ? `<small>${e(l.unit)}</small>` : ""}</b>` : `<b class="txt">${e(l.text || "")}</b>`;
      return `<div class="fc-tf-line${l.op === "=" ? " eq" : ""}${last ? " res" : ""}"><span class="op">${e(l.op || "")}</span><span class="lb">${e(l.label)}${l.note ? `<small>${e(l.note)}</small>` : ""}</span>${val}</div>`;
    }).join("")}</div>`,
    table: (b) => `<div class="fc-tf-table">${tfTitle(b)}<div class="table-wrap"><table><thead><tr>${b.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r, i) => `<tr class="${(b.hl || []).includes(i) ? "hl" : ""}${(b.dim || []).includes(i) ? " dim" : ""}">${r.map((v) => `<td>${cellHtml(v)}</td>`).join("")}</tr>`).join("")}${b.foot ? `<tr class="foot">${b.foot.map((v) => `<td>${cellHtml(v)}</td>`).join("")}</tr>` : ""}</tbody></table></div></div>`,
    compare: (b) => `<div class="fc-tf-cmp${b.vs ? " vs" : ""}">${tfTitle(b)}<div class="table-wrap"><table><thead><tr>${b.heads.map((h, i) => `<th class="h${i}">${e(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th scope=\"row\""}>${cellHtml(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div></div>`,
    chunks: (b) => `<div class="fc-tf-chunks">${tfTitle(b)}${b.items.map((c) => `<div class="fc-chunk k-${e(c.family || "select")}"><span class="fc-chunk-role">${e(c.role)}</span><code>${e(c.text)}</code></div>`).join("")}</div>`,
    steps: (b) => `<ol class="fc-tf-steps">${b.items.map((it, i) => `<li><b>${i + 1}</b><div><strong>${e(it.title)}</strong>${it.detail ? `<p>${e(it.detail)}</p>` : ""}</div></li>`).join("")}</ol>`,
    bars: (b) => {
      const total = b.items.reduce((sum, i) => sum + i.value, 0);
      return `<div class="fc-tf-bars">${tfTitle(b)}${b.items.map((i) => `<div class="fc-tf-bar"><span class="lb">${e(i.label)}</span><span class="track"><i class="${i.tone ? "t-" + e(i.tone) : ""}" style="width:${Math.max(2, Math.round((i.value / total) * 100))}%"></i></span><b>${e(fmtNum(i.value))}${b.unit ? `<small>${e(b.unit)}</small>` : ""}</b>${b.share !== false ? `<em>${Math.round((i.value / total) * 1000) / 10}%</em>` : ""}</div>`).join("")}</div>`;
    },
    note: (b) => `<p class="fc-tf-note">${e(b.text)}</p>`,
    flow: (b) => `<div class="fc-tf-flow">${tfTitle(b)}${b.items.map((it, i) => `${i ? '<div class="fc-tf-down">↓</div>' : ""}<div class="fc-tf-stage"><div class="head"><b>${i + 1}</b><strong>${e(it.title)}</strong>${it.badge ? `<span class="badge">${e(it.badge)}</span>` : ""}</div>${it.detail ? `<p>${e(it.detail)}</p>` : ""}${it.table ? `<div class="table-wrap"><table><thead><tr>${it.table.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${it.table.rows.map((r, ri) => `<tr class="${(it.table.hl || []).includes(ri) ? "hl" : ""}${(it.table.dim || []).includes(ri) ? " dim" : ""}">${r.map((v) => `<td>${cellHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}</div>`).join("")}</div>`,
    pairs: (b) => `<div class="fc-tf-pairs">${tfTitle(b)}${b.items.map((p) => `<div class="fc-tf-pair ${p.tone ? "t-" + e(p.tone) : ""}"><span class="l">${e(p.left)}</span><span class="ar">→</span><span class="r">${e(p.right)}</span>${p.note ? `<small>${e(p.note)}</small>` : ""}</div>`).join("")}</div>`,
  };
  tfBlocks.matrix = tfBlocks.compare;
  function teachFigure(spec) {
    return `<section class="fc-sec fc-fig fc-tf"><h3 class="fc-h"><i></i>${e(spec.title)}</h3>${spec.caption ? `<p class="fc-hint">${e(spec.caption)}</p>` : ""}${spec.blocks.map((b) => (tfBlocks[b.type] ? tfBlocks[b.type](b) : "")).join("")}${spec.footer || spec.blocks.some((b) => b.type === "calc" || b.type === "bars") ? `<p class="fc-tf-foot">${e(spec.footer || "图中数字来自本卡内容，计算过程已逐步核对。")}</p>` : ""}</section>`;
  }

  function decorate(card) {
    const sections = (card.back?.sections || []).map((x) => ({ section: x }));
    const pair = errorPair(card);
    // 对比图的右侧就是完整的“正确代码”（含高亮），所以用它取代单独的代码块，避免同一段代码连续出现两次。
    if (pair) sections.splice(pair.at, 1, { html: codeDiffFigure(pair.diff) });
    if (card.type === "syntax") {
      const index = sections.findIndex((x) => x.section?.type === "syntax");
      const chunks = index >= 0 ? syntaxChunks(sections[index].section.content) : null;
      if (chunks) sections.splice(index + 1, 0, { html: chunkFigure(chunks) });
    }
    if (card.type === "comparison") {
      const cmp = compareResults(card);
      if (cmp) sections.splice(cmp.at + 1, 0, { html: compareFigure(cmp) });
    }
    const calls = callPairs(card);
    if (calls) {
      const firstCode = sections.findIndex((x) => x.section?.type === "code");
      const afterTable = firstCode >= 0 ? sections.findIndex((x, i) => i > firstCode && x.section?.type === "table") : -1;
      const at = afterTable >= 0 ? afterTable + 1 : Math.max(1, sections.findIndex((x) => x.section?.type === "syntax") + 1);
      sections.splice(at, 0, { html: callFigure(calls) });
    }
    const data = dataFigure(card);
    if (data) {
      const first = sections.findIndex((x) => x.section?.type === "code" || (x.html && /fc-(diff|calls)/.test(x.html)));
      sections.splice(first >= 0 ? first : sections.length, 0, { html: data });
    }
    return sections;
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
    return `<article class="fc fc-${card.type} back" aria-label="背面"><h2 class="fc-title">${e(card.front?.prompt ?? "")}</h2><div class="fc-answer">${paragraphs(card.back?.answer)}</div>${card.teach ? teachFigure(card.teach) : ""}${template.compose ? composeBack(card, template) : decorate(card).map((x) => x.html ?? section(x.section, template)).join("")}${extra}</article>`;
  }

  return { front, back, meta };
}
