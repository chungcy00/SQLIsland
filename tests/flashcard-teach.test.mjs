// 闪卡教学图解：每张图的结构、数值来源和计算步骤都要通过核对。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCards } from "../src/flashcard-model.mjs";
import { validateAll, validateFigure } from "../src/flashcard-teach.mjs";

const root = new URL("../resources/CONTENT/flashcard_v2/", import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
const source = await read("cards.json");
const cards = normalizeCards(source, await read("illustration-map.json"));
const figures = await read("teaching-figures.json");

test("教学图解：全部通过结构、数值来源与计算核对", () => {
  const errors = validateAll(figures, cards);
  assert.deepEqual(errors, []);
  assert.ok(Object.keys(figures.figures).length >= 35);
});

test("教学图解：只补图示，不改原卡内容", () => {
  const raw = new Map(source.cards.map((c) => [c.id, c]));
  for (const id of Object.keys(figures.figures)) assert.ok(raw.has(id) && !("teach" in raw.get(id)), id);
});

test("教学图解核对器：能抓住算错的步骤和卡里没有的数字", () => {
  const card = cards.find((c) => c.id === "fc2-0340");
  const bad = { title: "x", blocks: [{ type: "calc", lines: [{ label: "a", value: 10000 }, { op: "−", label: "b", value: 1000 }, { op: "=", label: "c", value: 9500 }] }] };
  assert.ok(validateFigure("fc2-0340", bad, card).some((m) => m.includes("实际算出 9000")));
  const invented = { title: "x", blocks: [{ type: "calc", lines: [{ label: "a", value: 12345 }, { op: "−", label: "b", value: 1 }, { op: "=", label: "c", value: 12344 }] }] };
  assert.ok(validateFigure("fc2-0340", invented, card).some((m) => m.includes("12345")));
});
