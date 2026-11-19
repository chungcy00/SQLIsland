import test from "node:test";
import assert from "node:assert/strict";
import { islandLitCount, islandSvg } from "../src/island.js";

test("islandLitCount 边界", () => {
  const cases = [[0, 80, 0], [1, 80, 0], [6, 80, 0], [7, 80, 1], [23, 80, 3], [79, 80, 11], [80, 80, 12], [5, 0, 0], [0, 0, 0], [90, 80, 12], [-3, 80, 0]];
  for (const [done, total, expected] of cases) assert.equal(islandLitCount(done, total), expected, `${done}/${total}`);
  assert.equal(islandLitCount(NaN, 80), 0);
  assert.equal(islandLitCount(3, 20), 1);
});

test("islandSvg 点亮块数、顺序与装饰属性", () => {
  for (const lit of [0, 1, 3, 11, 12]) {
    const svg = islandSvg(lit);
    assert.equal((svg.match(/<rect /g) || []).length, 12);
    assert.equal((svg.match(/fill="#38607F"/g) || []).length, lit);
    assert.match(svg, /aria-hidden="true"/);
    assert.doesNotMatch(svg, /<animate|<script|<text/);
  }
  const three = islandSvg(3);
  const rects = three.match(/<rect [^>]*>/g);
  assert.ok(rects.slice(0, 3).every((r) => r.includes('fill="#38607F"')));
  assert.ok(rects.slice(3).every((r) => r.includes('fill="#F3F8FA"')));
  assert.equal(islandSvg(99).match(/fill="#38607F"/g).length, 12);
  assert.equal(islandSvg(-1).match(/fill="#38607F"/g), null);
});
