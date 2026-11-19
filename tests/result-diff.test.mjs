import test from "node:test";
import assert from "node:assert/strict";
import { diffComparison } from "../src/result-diff.js";

const cmp = (actual, expected, ac = ["v"], ec = ["v"]) => ({ actual: { columns: ac, rows: actual, rowCount: actual.length }, expected: { columns: ec, rows: expected, rowCount: expected.length } });
const ordered = { orderPolicy: "ordered" };
const marks = (d) => d.rows.map((r) => r.mark || "-").join("");

test("缺行", () => { const d = diffComparison(cmp([[1], [2]], [[1], [2], [3]]), ordered); assert.equal(marks(d), "--缺"); assert.match(d.summary, /少 1 行/); });
test("多行", () => { const d = diffComparison(cmp([[1], [2], [3]], [[1], [2]]), ordered); assert.equal(marks(d), "--多"); assert.match(d.summary, /多 1 行/); });
test("重复行算多", () => { const d = diffComparison(cmp([[1], [1], [2]], [[1], [2]]), ordered); assert.equal(marks(d).includes("多"), true); });
test("单元格不同：缺+多配对并标出不同列", () => {
  const d = diffComparison(cmp([[1, "a"], [2, "x"]], [[1, "a"], [2, "b"]], ["id", "n"], ["id", "n"]), ordered);
  assert.equal(marks(d), "-缺多");
  assert.deepEqual(d.rows[2].bad, [1]);
});
test("仅顺序不同：位置不同的行标序并带‘你的’值", () => {
  const d = diffComparison(cmp([[3], [2], [1]], [[1], [2], [3]]), ordered);
  assert.equal(marks(d), "序-序");
  assert.deepEqual(d.rows[0].actualCells, [3]);
  assert.match(d.summary, /行顺序不同/);
});
test("有多行同时顺序也不同：已匹配行标序（有序题）", () => {
  const d = diffComparison(cmp([[3], [2], [1], [4]], [[1], [2], [3]]), ordered);
  assert.ok(d.rows.some((r) => r.mark === "序"), marks(d));
  assert.ok(d.rows.some((r) => r.mark === "多"));
  const unordered = diffComparison(cmp([[3], [2], [1], [4]], [[1], [2], [3]]), { orderPolicy: "unordered_multiset" });
  assert.equal(unordered.rows.some((r) => r.mark === "序"), false);
});
test("列不一致", () => { const d = diffComparison(cmp([[1]], [[1]], ["a"], ["v"]), ordered); assert.equal(d.columnsSame, false); assert.match(d.summary, /列不一致/); });
test("NULL 参与比对", () => { const d = diffComparison(cmp([[null], [1]], [[1], [null]]), ordered); assert.equal(marks(d), "序序"); });
test("数值容差内视为相同", () => {
  const d = diffComparison(cmp([[1.0004]], [[1.0]]), { ...ordered, numericTolerance: { absolute: 0.01 } });
  assert.equal(marks(d), "-");
});
test("内容完全相同时给出说明而不是空差异", () => { const d = diffComparison(cmp([[1], [2]], [[1], [2]]), ordered); assert.match(d.summary, /行内容相同/); });
