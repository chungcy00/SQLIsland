// Android 模拟器/真机实测（WebView 内）：需要先启动设备并安装当前 APK（`adb devices` 可见），应用为可调试构建。
// 流程：冷启动 → 课程完成并写笔记 → 独立编写题运行/提交 → 闪卡真实触摸翻面 → 实验室真实查询 → 自定义 SQL 键盘位置 → 无整页横向溢出。
// 结果写入 artifacts/android-validation.json。更完整的 B11 清单见 HANDOFF.md。
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const adb = '.tooling/sdk/platform-tools/adb';
const sh = (...args) => execFileSync(adb, ['shell', ...args], {encoding: 'utf8'}).trim();
let devices = '';
try { devices = execFileSync(adb, ['devices'], {encoding: 'utf8'}); } catch { /* adb 不可用 */ }
if (!/\tdevice\b/.test(devices)) { console.log('SKIP: 没有已连接的 Android 设备/模拟器（先运行模拟器并安装 APK）。'); process.exit(0); }
const pid = sh('pidof', 'cn.sqlstudy.offline');
execFileSync(adb, ['forward', 'tcp:9223', 'localabstract:webview_devtools_remote_' + pid]);
const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
let sequence = 0; const pending = new Map();
socket.addEventListener('message', ({data}) => { const message = JSON.parse(data); const item = pending.get(message.id); if (item) { pending.delete(message.id); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); } });
const evaluate = expression => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve: result => resolve(result.result?.value), reject}); socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, returnByValue: true, awaitPromise: true}})); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (expression, label, ms = 20000) => { const start = Date.now(); while (Date.now() - start < ms) { if (await evaluate(expression)) return; await sleep(200); } throw Error('timeout: ' + label); };
const route = async path => { await evaluate(`location.hash=${JSON.stringify('#' + path)}`); await waitFor('!!document.querySelector(".appbar")', 'appbar ' + path); await sleep(600); };
const report = {pass: false, flows: []};
try {
  await route('/'); await waitFor('!!document.querySelector(".continue")', '首页');
  assert.equal(await evaluate('document.querySelector(".hero")===null'), true); report.flows.push('冷启动与首页');
  await route('/lesson/kp01-01'); await waitFor('!!document.querySelector("[data-action=lessonRun]")', '课程运行按钮');
  await evaluate('document.querySelector("[data-action=lessonRun]").click()'); await waitFor('document.body.innerText.includes("本次 SQLite 兼容执行结果")', '课程运行结果');
  await evaluate('document.querySelector("[data-action=completeLesson]").click()'); report.flows.push('课程兼容 SQL 与完成学习');
  await route('/question/q0009'); await waitFor('!!document.querySelector("#sql-editor")', '编辑器');
  await evaluate(`(()=>{const e=document.querySelector('#sql-editor');e.value='SELECT DISTINCT price FROM products ORDER BY price';e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(400);
  await evaluate('document.querySelector("[data-action=runQuestion]").click()'); await waitFor('!!document.querySelector("table")', '题目运行结果');
  await evaluate('document.querySelector("[data-action=submitQuestion]").click()'); await waitFor('document.body.innerText.includes("回答正确")', '提交判题'); report.flows.push('独立编写题运行与判题');
  await route('/cards'); await evaluate('document.querySelector("[data-action=cardMode][data-arg=新卡]").click()'); await sleep(300);
  await evaluate('document.querySelector("[data-action=startCards]").click()'); await waitFor('!!document.querySelector(".flashcard.front")', '闪卡正面');
  const box = await evaluate('(()=>{const r=document.querySelector(".flashcard").getBoundingClientRect(),d=devicePixelRatio;const top=innerHeight*d<2400?0:0;return [Math.round((r.left+r.right)/2*d),Math.round((r.top+r.bottom)/2*d)+Math.round(window.outerHeight*0+0)]})()');
  const offset = Number(sh('wm', 'size').match(/(\d+)x(\d+)/)[2]) - Math.round(await evaluate('innerHeight * devicePixelRatio'));
  sh('input', 'tap', String(box[0]), String(box[1] + offset)); await waitFor('!!document.querySelector(".flashcard.back")', '真实触摸翻面'); report.flows.push('闪卡真实触摸翻面');
  await route('/lab'); await evaluate('document.querySelector("[data-action=labTab][data-arg=代码]")?.click()'); await waitFor('!!document.querySelector("#sql-editor")', '实验室编辑器'); await evaluate(`(()=>{const s=document.querySelector('#lab-dataset');s.value='retail-v2';s.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(4000);
  await evaluate(`(()=>{const e=document.querySelector('#sql-editor');e.value='SELECT * FROM v_sales_lines LIMIT 8';e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(400);
  await evaluate('document.querySelector("[data-action=runLab]").click()'); await waitFor('!!document.querySelector(".table-wrap table")', '实验室结果', 40000); report.flows.push('实验室真实查询');
  for (const path of ['/', '/learn', '/practice', '/cards', '/mine', '/settings']) { await route(path); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'overflow ' + path); } report.flows.push('主要页面无整页横向溢出');
  report.android = sh('getprop', 'ro.build.version.release'); report.api = sh('getprop', 'ro.build.version.sdk'); report.version = sh('dumpsys', 'package', 'cn.sqlstudy.offline').match(/versionName=(\S+)/)?.[1];
  report.pass = true; await writeFile('artifacts/android-validation.json', JSON.stringify(report, null, 2)); console.log(report);
} finally { socket.close(); }
