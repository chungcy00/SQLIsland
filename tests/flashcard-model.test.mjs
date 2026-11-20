import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCard, normalizeCards, mergedFromOf, TYPE_ORDER } from "../src/flashcard-model.mjs";
import { createCardView } from "../src/flashcard-view.js";
import { mergeTimeline, formulaLines, parseFormula } from "../src/flashcard-blocks.mjs";

const root = "resources/CONTENT/flashcard_v2";
const source = JSON.parse(await readFile(`${root}/cards.json`));
const map = JSON.parse(await readFile(`${root}/illustration-map.json`));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const view = createCardView({
  e: esc,
  table: (columns, rows) => `<table>${columns.length}x${rows.length}</table>`,
  code: (sql) => `<pre>${esc(sql)}</pre>`,
  tag: (text) => `<span>${esc(text)}</span>`,
});

test("332 张正式卡、八类、三级别齐全且编号唯一", () => {
  const cards = normalizeCards(source, map);
  assert.equal(cards.length, 332);
  assert.equal(new Set(cards.map((c) => c.id)).size, 332);
  assert.deepEqual([...new Set(cards.map((c) => c.type))].sort(), [...TYPE_ORDER].sort());
  assert.deepEqual([...new Set(cards.map((c) => c.interviewTier))].sort(), ["知识拓展", "面试必学", "面试进阶"].sort());
});

test("适配不修改原始对象，且保留全部原字段", () => {
  const before = JSON.stringify(source);
  const cards = normalizeCards(source, map, { slim: true });
  assert.equal(JSON.stringify(source), before);
  source.cards.forEach((raw, i) => {
    for (const key of Object.keys(raw)) assert.ok(key in cards[i], `${raw.id} 缺少 ${key}`);
    assert.equal(cards[i].id, raw.id);
    assert.equal(cards[i].interviewTier, raw.interviewTier);
  });
});

test("两种合并字段都能读取", () => {
  assert.deepEqual(mergedFromOf({ interviewMergedFrom: ["fc2-0008"] }), ["fc2-0008"]);
  assert.deepEqual(mergedFromOf({ interviewRevision: { mergedFrom: ["fc2-0317"] } }), ["fc2-0317"]);
  assert.deepEqual(mergedFromOf({}), []);
  // 验收报告 mergedCount=138 指被合并掉的来源编号总数（均不在正式池内），不是带合并字段的卡数（94 张）。
  const cards = normalizeCards(source, map);
  const sources = new Set(cards.flatMap((c) => c.mergedFrom));
  assert.equal(sources.size, 138);
  assert.equal(cards.filter((c) => c.mergedFrom.length).length, 94);
  assert.ok(![...sources].some((id) => cards.some((c) => c.id === id)));
});

test("插画：映射 null 不补图，函数卡使用代码插画", () => {
  const cards = normalizeCards(source, map);
  for (const c of cards) {
    if (c.type === "function") assert.equal(c.illustrationKey, "code");
    else if (map[c.id] === null && !c.front.illustration) assert.equal(c.illustrationKey, null, c.id);
  }
  assert.equal(cards.filter((c) => c.illustrationKey).length, 219 + 53);
});

test("打包副本去掉 actual，其余示例字段保留", () => {
  const slim = normalizeCards(source, map, { slim: true });
  for (const c of slim) {
    for (const ex of [c.example, ...(c.examples || [])].filter(Boolean)) {
      assert.ok(!("actual" in ex));
      assert.ok("setupSql" in ex);
    }
  }
});

test("332 张全部可渲染双面，不出现 undefined，内容不丢失", () => {
  for (const card of normalizeCards(source, map, { slim: true })) {
    const html = view.front(card) + view.back(card);
    assert.ok(!html.includes("undefined"), card.id);
    assert.ok(html.includes("fc-answer"), card.id);
    if (!["query", "metric"].includes(card.type)) {
      const rendered = (view.back(card).match(/class="fc-sec (?!fc-fig)/g) || []).length;
      // 常见错误卡的“正确代码”块由对比图取代（对比图右侧含完整的正确代码），所以普通区块少一个。
      assert.equal(rendered, card.back.sections.length - (card.type === "error" ? 1 : 0), card.id);
      continue;
    }
    // 查询思路/业务指标会重组展示：逐项确认每个代码、表格内容、说明文字都仍在页面里
    for (const sec of card.back.sections) {
      if (sec.type === "code") assert.ok(html.includes(esc(sec.content)), `${card.id} 代码丢失`);
      if (sec.type === "table") {
        assert.ok(html.includes(`${sec.columns.length}x${sec.rows.length}`), `${card.id} 表格丢失`);
      }
      if (sec.type === "note") assert.ok(html.includes(esc(sec.content.split("\n")[0])), `${card.id} 注意事项丢失`);
      if (sec.type === "diagram") for (const n of sec.nodes) assert.ok(html.includes(esc(n.label.replace(/^\d+[.、]\s*/, ""))), `${card.id} 流程节点丢失`);
      if (sec.type === "text" && card.type === "query") {
        for (const line of sec.content.split(/\n+/).filter(Boolean)) {
          const body = line.replace(/^\s*\d+\s*[.、．]\s*/, "");
          // 时间线把“标题：说明”拆开显示，两段都必须在
          const [head, ...rest] = body.split(/[：:]/);
          assert.ok(html.includes(esc(head.trim())), `${card.id} 步骤丢失`);
          if (rest.length) assert.ok(html.includes(esc(rest.join("：").trim())) || html.includes(esc(rest.join(":").trim())), `${card.id} 步骤说明丢失：${line}`);
        }
      }
    }
  }
});

test("步骤时间线：能合并的合并，且标题与说明合起来等于原文", () => {
  const cards = normalizeCards(source, map).filter((c) => c.type === "query");
  let merged = 0;
  for (const card of cards) {
    const text = card.back.sections.find((x) => x.type === "text");
    const diagram = card.back.sections.find((x) => x.type === "diagram");
    const steps = mergeTimeline(text, diagram);
    if (!steps) continue;
    merged++;
    const lines = text.content.split(/\n+/).filter(Boolean);
    steps.forEach((step, i) => {
      const body = lines[i].replace(/^\s*\d+\s*[.、．]\s*/, "");
      assert.ok(body.includes(step.title), card.id);
      if (step.detail) assert.ok(body.includes(step.detail), card.id);
    });
  }
  assert.ok(merged >= 50, `merged ${merged}`);
});

test("业务指标公式：50 张都是中文公式，分式只在恰有一个顶层 ÷ 时生成", () => {
  const cards = normalizeCards(source, map).filter((c) => c.type === "metric");
  assert.equal(cards.length, 50);
  let fractions = 0;
  for (const card of cards) {
    const sec = card.back.sections.find((x) => /公式/.test(x.title));
    assert.ok(sec, card.id);
    assert.ok(!/SELECT|SUM\(|COUNT\(/i.test(sec.content), `${card.id} 公式含查询语句`);
    for (const line of formulaLines(sec.content)) {
      const f = parseFormula(line);
      if (f.fraction) {
        fractions++;
        assert.ok(line.includes(f.fraction.top) && line.includes(f.fraction.bottom), card.id);
      }
    }
  }
  assert.ok(fractions > 20);
});

test("常见错误卡：44 张都有错误/正确写法对比图，高亮词来自卡片自己的代码", async () => {
  const { errorPair } = await import("../src/flashcard-blocks.mjs");
  const cards = normalizeCards(source, map).filter((c) => c.type === "error");
  assert.equal(cards.length, 44);
  for (const card of cards) {
    const pair = errorPair(card);
    assert.ok(pair, card.id);
    const html = view.back(card);
    assert.ok(html.includes("fc-diff"), card.id);
    // 两侧拼回去必须等于原代码（不增不减）
    assert.equal(pair.diff.wrong.map((x) => x.t).join(""), card.front.code, card.id);
    assert.equal(pair.diff.right.map((x) => x.t).join(""), card.back.sections[pair.at].content, card.id);
    assert.ok(pair.diff.changedWrong + pair.diff.changedRight > 0, card.id);
    // 正面不放图示
    assert.ok(!view.front(card).includes("fc-diff"), card.id);
  }
});

test("函数用法卡：45 张有“输入 → 函数 → 输出”图，输出值来自卡片记录的预期结果，正面不放图", async () => {
  const { callPairs } = await import("../src/flashcard-blocks.mjs");
  const cards = normalizeCards(source, map).filter((c) => c.type === "function");
  let n = 0;
  for (const card of cards) {
    const found = callPairs(card);
    const html = view.back(card);
    assert.equal(html.includes("fc-calls"), !!found, card.id);
    assert.ok(!view.front(card).includes("fc-calls"), card.id);
    if (!found) continue;
    n++;
    const ex = found.example;
    found.pairs.forEach((p, i) => assert.deepEqual(p.value, ex.expected.rows[0][i], card.id));
  }
  assert.equal(n, 45);
});

test("语法结构卡：25 张有语法分块图，分块拼回去等于原模板，正面不放图", async () => {
  const { syntaxChunks } = await import("../src/flashcard-blocks.mjs");
  const cards = normalizeCards(source, map).filter((c) => c.type === "syntax");
  let n = 0;
  for (const card of cards) {
    const template = card.back.sections.find((s) => s.type === "syntax").content;
    const chunks = syntaxChunks(template);
    assert.equal(view.back(card).includes("fc-chunks"), !!chunks, card.id);
    assert.ok(!view.front(card).includes("fc-chunks"), card.id);
    if (!chunks) continue;
    n++;
    assert.equal(chunks.map((c) => c.text).join("").replace(/\s+/g, ""), template.trim().replace(/;\s*$/, "").replace(/\s+/g, ""), card.id);
  }
  assert.equal(n, 25);
});

test("用法辨析卡：并排结果对比图的每一行都来自卡片自己的结果表，正面不放图", async () => {
  const { compareResults } = await import("../src/flashcard-blocks.mjs");
  const cards = normalizeCards(source, map).filter((c) => c.type === "comparison");
  let n = 0;
  for (const card of cards) {
    const cmp = compareResults(card);
    assert.equal(view.back(card).includes("fc-cmp"), !!cmp, card.id);
    assert.ok(!view.front(card).includes("fc-cmp"), card.id);
    if (!cmp) continue;
    n++;
    for (const t of cmp.tables) {
      const found = card.back.sections.find((s) => s.type === "table" && JSON.stringify(s.rows) === JSON.stringify(t.rows.map((r) => r.row)));
      assert.ok(found, `${card.id} ${t.title}`);
      assert.deepEqual(found.columns, t.columns);
    }
  }
  assert.ok(n >= 15, `figures ${n}`);
});

test("示例数据：没有“数据示例”表的 145 张卡，背面代码前显示示例 setupSql 建出的表，正面不放", async () => {
  const { addDataSets } = await import("../scripts/flashcard-data.mjs");
  const cards = addDataSets(normalizeCards(source, map, { slim: true })).filter((c) => c.dataSets);
  assert.equal(cards.length, 145);
  for (const card of cards) {
    const html = view.back(card);
    assert.ok(html.includes("fc-data"), card.id);
    assert.ok(!view.front(card).includes("fc-data"), card.id);
    const sql = (card.examples?.length ? card.examples : [card.example]).map((x) => x.setupSql).join("\n");
    for (const set of card.dataSets) for (const t of set.tables) {
      assert.ok(new RegExp("\\b" + t.name + "\\b", "i").test(sql), `${card.id} ${t.name}`);
      assert.ok(t.rows.length <= 30 && t.rowCount >= t.rows.length, `${card.id} ${t.name}`);
      assert.ok(t.rows.every((r) => r.length === t.columns.length));
    }
    // 数据块必须出现在第一个代码之前
    const firstCode = html.search(/class="fc-sec (fc-codeblock|fc-group)/);
    assert.ok(html.indexOf("fc-data") < (firstCode < 0 ? Infinity : firstCode) || firstCode < 0, card.id);
  }
});

test("业务指标卡：代入数字图的每个数都来自示例结果行，并且按公式重算与记录值一致", async () => {
  const { metricSubstitution } = await import("../src/flashcard-blocks.mjs");
  const cards = normalizeCards(source, map).filter((c) => c.type === "metric");
  let n = 0;
  for (const card of cards) {
    const sub = metricSubstitution(card);
    assert.equal(view.back(card).includes("fc-subst"), !!sub, card.id);
    assert.ok(!view.front(card).includes("fc-subst"), card.id);
    if (!sub) continue;
    n++;
    const found = card.back.sections.some((s) => s.type === "table" && s.columns.includes(sub.top.column) && s.columns.includes(sub.bottom.column) && s.columns.includes(sub.target.column) && s.rows.some((r) => r[s.columns.indexOf(sub.top.column)] === sub.top.value && r[s.columns.indexOf(sub.bottom.column)] === sub.bottom.value && r[s.columns.indexOf(sub.target.column)] === sub.target.value));
    assert.ok(found, card.id);
    assert.ok(Math.abs((sub.top.value / sub.bottom.value) * sub.factor - sub.target.value) <= Math.max(0.0051, Math.abs(sub.target.value) * 1e-6), card.id);
  }
  assert.equal(n, 26);
});
