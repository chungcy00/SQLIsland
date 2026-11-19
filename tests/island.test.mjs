import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { islandLitCount, islandSvg } from "../src/island.js";

const source = readFileSync(new URL("../resources/ASSETS/v2/illustrations/milestone/milestone.svg", import.meta.url), "utf8");

test("islandLitCount 边界", () => {
  const cases = [[0, 80, 0], [1, 80, 0], [6, 80, 0], [7, 80, 1], [23, 80, 3], [79, 80, 11], [80, 80, 12], [5, 0, 0], [0, 0, 0], [90, 80, 12], [-3, 80, 0]];
  for (const [done, total, expected] of cases) assert.equal(islandLitCount(done, total), expected, `${done}/${total}`);
  assert.equal(islandLitCount(NaN, 80), 0);
  assert.equal(islandLitCount(3, 20), 1);
});

test("islandSvg 使用用户提供插画的矢量版并按编号点亮", () => {
  assert.equal((source.match(/class="tile"/g) || []).length, 12);
  for (const lit of [0, 1, 3, 11, 12]) {
    const svg = islandSvg(lit, source, "learning-hero-art");
    assert.equal((svg.match(/class="tile on"/g) || []).length, lit);
    assert.equal((svg.match(/id="tile-\d+" class="tile on"/g) || []).length, lit);
    for (let n = 1; n <= 12; n++) {
      const tile = svg.match(new RegExp(`<path id="tile-${n}"[^>]*>`))[0];
      assert.equal(tile.includes('fill="#38607F" stroke="#38607F"'), n <= lit, `lit=${lit} tile-${n}`);
    }
    assert.match(svg, /aria-hidden="true"/);
    assert.doesNotMatch(svg, /role="img"|aria-label|<script|<animate/);
    assert.ok(svg.includes('id="flag"'));
  }
  assert.equal(islandSvg(99, source).match(/class="tile on"/g).length, 12);
  assert.equal(islandSvg(-1, source).match(/class="tile on"/g), null);
});
