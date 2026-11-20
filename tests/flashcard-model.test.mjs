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
      const rendered = (view.back(card).match(/class="fc-sec /g) || []).length;
      assert.equal(rendered, card.back.sections.length, card.id);
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
