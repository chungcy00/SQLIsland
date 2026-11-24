import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("面试刷题 98 题：参考答案在全部夹具上通过应用判题，判题能拒绝改动结果", () => {
  const out = execFileSync("node", ["scripts/check-interview-questions.mjs"], { encoding: "utf8" });
  assert.match(out, /面试题 98 道、夹具 \d+ 个/);
});

test("面试题库独立于 120 道章节练习题", () => {
  const content = JSON.parse(fs.readFileSync("dist/content.json", "utf8"));
  assert.equal(content.questions.length, 120);
  assert.equal(content.interview.length, 98);
  assert.ok(content.interview.every((q) => q.chapterId === "interview" && /^i\d{3}$/.test(q.id)));
  assert.equal(new Set([...content.questions, ...content.interview].map((q) => q.id)).size, 218);
});

test("GROUP BY 位置序号被当作分组键（严格分组检查）", async () => {
  const { checkStructure } = await import("../src/engine.js");
  assert.equal(checkStructure("SELECT a, COUNT(*) FROM t GROUP BY 1", []).pass, true);
  assert.equal(checkStructure("SELECT a, b, COUNT(*) FROM t GROUP BY 1", []).pass, false);
});
