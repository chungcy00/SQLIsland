// 图示数值核对：用 SQL Worker 实际执行，确认图示里的真值、行数和保留行与课程示例数据一致。
// 需要先 `npm run preview`（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4173/'); await page.locator('.appbar').waitFor();
  const report = await page.evaluate(async () => {
    const content = await (await fetch('content.json')).json();
    const lessons = content.chapters.flatMap(c => c.knowledgePoints).filter(k => k.figures);
    const worker = new Worker('sql-worker.js'); let sequence = 0; const calls = new Map();
    worker.onmessage = ({data}) => { const call = calls.get(data.id); calls.delete(data.id); data.error ? call.reject(Error(data.error)) : call.resolve(data.result); };
    const run = payload => new Promise((resolve, reject) => { const id = ++sequence; calls.set(id, {resolve, reject}); worker.postMessage({id, action: 'lesson', payload}); });
    const out = [];
    try {
      for (const lesson of lessons) for (const figure of lesson.figures) {
        const tables = lesson.sourceTables, setupSql = lesson.setupSql;
        if (figure.kind === 'truth-table') {
          const result = await run({tables, setupSql, sql: `SELECT ${figure.keyColumn}, ${figure.valueColumn}, CASE WHEN (${figure.predicate}) IS NULL THEN 'unknown' WHEN ${figure.predicate} THEN 'true' ELSE 'false' END FROM ${figure.table} ORDER BY ${figure.keyColumn}`});
          out.push({id: figure.id, expected: figure.rows.map(r => [r.key, r.value, r.truth]), actual: result.rows});
          const kept = await run({tables, setupSql, sql: `SELECT ${figure.keyColumn} FROM ${figure.table} WHERE ${figure.predicate} ORDER BY ${figure.keyColumn}`});
          out.push({id: figure.id + ':kept', expected: figure.rows.filter(r => r.truth === 'true').map(r => [r.key]), actual: kept.rows});
        } else if (figure.kind === 'row-flow') {
          for (const [index, step] of figure.steps.entries()) {
            const result = await run({tables, setupSql, sql: step.sql});
            const key = result.columns.indexOf(figure.keyColumn);
            out.push({id: `${figure.id}:step${index + 1}`, expected: [...step.keptKeys].sort((a, b) => a - b), actual: result.rows.map(r => r[key]).sort((a, b) => a - b)});
          }
        } else if (figure.kind === 'clause-map') {
          const result = await run({tables, setupSql, sql: figure.sql});
          out.push({id: figure.id, expected: lesson.result.rows, actual: result.rows});
        }
      }
      return out;
    } finally { worker.terminate(); }
  });
  for (const item of report) assert.deepEqual(item.actual, item.expected, item.id);
  assert.deepEqual(errors, []);
  console.log(`Figures verified by execution: ${report.length} checks.`);
} finally { await browser.close(); }
