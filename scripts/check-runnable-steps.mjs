// 可运行分步的数值复核：用应用的 SQL Worker 在课程自己的示例数据上实际执行每一个“可运行”步骤，
// 并与课文里记录的中间结果（列与行）逐项比较；同时核对最后一步与课文预期结果一致。
// 需要先 `npm run preview`（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4173/'); await page.locator('.appbar').waitFor();
  const report = await page.evaluate(async () => {
    const content = await (await fetch('content.json')).json();
    const databases = await (await fetch('databases.json')).json();
    const lessons = content.chapters.flatMap(c => c.knowledgePoints).filter(k => k.presentation?.breakdown?.some(step => step.kind === 'runnable'));
    const worker = new Worker('sql-worker.js'); let sequence = 0; const calls = new Map();
    worker.onmessage = ({data}) => { const call = calls.get(data.id); calls.delete(data.id); data.error ? call.reject(Error(data.error)) : call.resolve(data.result); };
    const run = payload => new Promise((resolve, reject) => { const id = ++sequence; calls.set(id, {resolve, reject}); worker.postMessage({id, action: 'lesson', payload}); });
    const out = [];
    try {
      for (const lesson of lessons) {
        const tables = lesson.datasetId ? undefined : lesson.sourceTables, setupSql = lesson.setupSql;
        const path = databases.datasets.find(d => d.id === lesson.datasetId)?.path;
        const steps = lesson.presentation.breakdown;
        for (const [index, step] of steps.entries()) {
          if (step.kind !== 'runnable') continue;
          let actual;
          try { actual = await run({tables, setupSql, path, sql: step.sql}); }
          catch (error) { out.push({id: `${lesson.id}:step${index + 1}`, error: error.message}); continue; }
          // 课文只记录前若干行时（totalRows 大于记录行数）：比较记录的那些行，并核对总行数。
          const total = step.result.totalRows ?? (index === steps.length - 1 ? lesson.result.totalRows : undefined);
          const truncated = total !== undefined && total > step.result.rows.length;
          out.push({id: `${lesson.id}:step${index + 1}:columns`, expected: step.result.columns, actual: actual.columns});
          out.push({id: `${lesson.id}:step${index + 1}:rows`, expected: step.result.rows, actual: truncated ? actual.rows.slice(0, step.result.rows.length) : actual.rows});
          if (truncated) out.push({id: `${lesson.id}:step${index + 1}:total-rows`, expected: total, actual: actual.rows.length});
        }
        const last = steps.at(-1);
        if (last.kind === 'runnable') {
          out.push({id: `${lesson.id}:last-vs-expected:columns`, expected: lesson.result.columns, actual: last.result.columns});
          out.push({id: `${lesson.id}:last-vs-expected:rows`, expected: lesson.result.rows, actual: last.result.rows});
        }
      }
    } finally { worker.terminate(); }
    return {lessons: lessons.map(l => l.id), checks: out};
  });
  const failures = report.checks.filter(item => item.error || JSON.stringify(item.actual) !== JSON.stringify(item.expected));
  await writeFile(process.env.SQL_STEP_REPORT || 'artifacts/runnable-steps-report.json', JSON.stringify({lessons: report.lessons.length, checks: report.checks.length, failures}, null, 2));
  for (const item of failures.slice(0, 12)) console.log('MISMATCH', item.id, item.error || JSON.stringify(item.expected).slice(0, 160) + ' !== ' + JSON.stringify(item.actual).slice(0, 160));
  assert.equal(failures.length, 0, `${failures.length} mismatches`);
  assert.deepEqual(errors, []);
  console.log(`Runnable steps verified in the browser worker: ${report.lessons.length} lessons, ${report.checks.length} checks.`);
} finally { await browser.close(); }
