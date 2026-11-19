// 读取 新版设计规范/DESIGN.md §4 的令牌与对比度组合，计算 WCAG 比值；任一不达标则退出码非 0。
import { readFile } from "node:fs/promises";
const doc = await readFile("新版设计规范/DESIGN.md", "utf8");
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// 从 §4.1 基础色表读取令牌；缺失则报错，避免与文档漂移。
const tok = {};
for (const m of doc.matchAll(/^\| `--([\w-]+)` \|[^|]*\| `(#[0-9A-Fa-f]{6})`/gm)) tok[m[1]] = m[2].toUpperCase();
const need = ["primary", "teal", "bg", "card", "lake", "ink", "ink2", "ctl", "sun"];
for (const k of need) if (!tok[k]) { console.error(`DESIGN.md §4.1 缺少令牌 --${k}`); process.exit(2); }
// 语义色表：| 语义 | `文字` | `浅底` |
const sem = {};
for (const m of doc.matchAll(/^\| (成功 \/ 修正|警告 \/ 注意|错误 \/ 易错|提示 \/ 信息) \| `(#\w{6})` \| `(#\w{6})`/gm)) sem[m[1]] = [m[2].toUpperCase(), m[3].toUpperCase()];
if (Object.keys(sem).length !== 4) { console.error("DESIGN.md §4.2 语义色表解析失败"); process.exit(2); }
// 教学色标与编辑器配色
const teach = {};
for (const m of doc.matchAll(/^\| (取数 SELECT \/ FROM|筛选 WHERE \/ HAVING|聚合 GROUP BY|连接 JOIN|排序 \/ 窗口) \| `(#\w{6})`/gm)) teach[m[1]] = m[2].toUpperCase();
const ed = {};
for (const m of doc.matchAll(/^\| (关键字|函数|字符串|数字|字段\/表名|运算符 \/ 普通文本|注释（斜体）) \| `(#\w{6})` \| `(#\w{6})`/gm)) ed[m[1]] = [m[2].toUpperCase(), m[3].toUpperCase()];
if (Object.keys(teach).length !== 5 || Object.keys(ed).length !== 7) { console.error("色标/编辑器配色表解析失败"); process.exit(2); }
const T = tok;
const checks = [];
const add = (name, fg, bg, min) => checks.push({ name, fg, bg, min, v: ratio(fg, bg) });
add("正文 ink / bg", T.ink, T.bg, 4.5);
add("正文 ink / card", T.ink, T.card, 4.5);
add("次文字 ink2 / bg", T["ink2"], T.bg, 4.5);
add("次文字 ink2 / card", T["ink2"], T.card, 4.5);
add("次文字 ink2 / lake", T["ink2"], T.lake, 4.5);
add("白字 / primary", T.card, T.primary, 4.5);
add("primary / bg（链接）", T.primary, T.bg, 4.5);
add("primary / lake", T.primary, T.lake, 4.5);
add("primary-press / 白字", T.card, T["primary-press"] || T.primary, 4.5);
add("teal / card", T.teal, T.card, 4.5);
add("控件描边 ctl / card（≥3）", T.ctl, T.card, 3);
for (const [k, [fg, bg]] of Object.entries(sem)) add(`语义 ${k} 文字 / 浅底`, fg, bg, 4.5);
for (const [k, c] of Object.entries(teach)) add(`教学色标 ${k} / 白`, c, T.card, 4.5);
for (const [k, [l, d]] of Object.entries(ed)) {
  const dark = k.startsWith("注释") ? 4.5 : 4.5;
  add(`编辑器 ${k} 浅色 / #FFFFFF`, l, "#FFFFFF", 4.5);
  add(`编辑器 ${k} 深色 / #162634`, d, "#162634", dark);
}
// 参考项：日光黄 / 白 文档已声明只作填充，不做文字，不计入失败。
let fail = 0;
for (const c of checks) {
  const ok = c.v >= c.min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.v.toFixed(2).padStart(5)}  (≥${c.min})  ${c.name}  ${c.fg} on ${c.bg}`);
}
console.log("\n参考项（规范 §4.5 未声明达标比值，不计入失败，实施时留意）：");
console.log(`  日光黄 / 白 = ${ratio(T.sun, T.card).toFixed(2)}（仅填充）`);
console.log(`  sun-ink #6B4A12 / 日光黄 = ${ratio("#6B4A12", T.sun).toFixed(4)}（正文级临界值 4.5）`);
console.log(`  控件描边 ctl / 浪沫 bg = ${ratio(T.ctl, T.bg).toFixed(2)}（规范仅声明在白底 3.02；控件应放白底）`);
console.log(`${checks.length - fail}/${checks.length} 通过`);
process.exit(fail ? 1 : 0);
