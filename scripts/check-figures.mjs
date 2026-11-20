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
    const databases = await (await fetch('databases.json')).json();
    const lessons = content.chapters.flatMap(c => c.knowledgePoints).filter(k => k.figures);
    const worker = new Worker('sql-worker.js'); let sequence = 0; const calls = new Map();
    worker.onmessage = ({data}) => { const call = calls.get(data.id); calls.delete(data.id); data.error ? call.reject(Error(data.error)) : call.resolve(data.result); };
    const run = payload => new Promise((resolve, reject) => { const id = ++sequence; calls.set(id, {resolve, reject}); worker.postMessage({id, action: 'lesson', payload}); });
    const out = [];
    try {
      for (const lesson of lessons) for (const figure of lesson.figures) {
        const tables = lesson.datasetId ? undefined : lesson.sourceTables, setupSql = lesson.setupSql, path = databases.datasets.find(d => d.id === lesson.datasetId)?.path;
        if (figure.kind === 'truth-table') {
          const result = await run({tables, setupSql, path, sql: `SELECT ${figure.keyColumn}, ${figure.valueColumn}, CASE WHEN (${figure.predicate}) IS NULL THEN 'unknown' WHEN ${figure.predicate} THEN 'true' ELSE 'false' END FROM ${figure.table} ORDER BY ${figure.keyColumn}`});
          out.push({id: figure.id, expected: figure.rows.map(r => [r.key, r.value, r.truth]), actual: result.rows});
          const kept = await run({tables, setupSql, path, sql: `SELECT ${figure.keyColumn} FROM ${figure.table} WHERE ${figure.predicate} ORDER BY ${figure.keyColumn}`});
          out.push({id: figure.id + ':kept', expected: figure.rows.filter(r => r.truth === 'true').map(r => [r.key]), actual: kept.rows});
        } else if (figure.kind === 'row-flow') {
          for (const [index, step] of figure.steps.entries()) {
            const result = await run({tables, setupSql, path, sql: step.sql});
            const key = result.columns.indexOf(figure.keyColumn);
            out.push({id: `${figure.id}:step${index + 1}`, expected: [...step.keptKeys].sort((a, b) => a - b), actual: result.rows.map(r => r[key]).sort((a, b) => a - b)});
          }
        } else if (figure.kind === 'stage-flow') {
          const norm = rows => rows.map(r => JSON.stringify(r)).sort();
          for (const [index, step] of figure.steps.entries()) {
            if (step.skip) continue;
            const result = await run({tables, setupSql, path, sql: step.sql});
            out.push({id: `${figure.id}:step${index + 1}:columns`, expected: step.columns, actual: result.columns});
            out.push({id: `${figure.id}:step${index + 1}:rows`, expected: norm(step.rows), actual: norm(result.rows)});
          }
        } else if (figure.kind === 'function-map') {
          const exprs = figure.outputs.map(output => output.sql).join(', ');
          if (figure.form === 'aggregate') {
            const result = await run({tables, setupSql, path, sql: `SELECT ${exprs} FROM ${figure.table}`});
            out.push({id: figure.id + ':aggregate', expected: [figure.outputs.map(output => output.value)], actual: result.rows});
            const input = await run({tables, setupSql, path, sql: `SELECT ${figure.inputColumns.join(', ')} FROM ${figure.table} ORDER BY ${figure.orderBy}`});
            out.push({id: figure.id + ':input', expected: figure.inputRows, actual: input.rows});
          } else {
            const result = await run({tables, setupSql, path, sql: `SELECT ${figure.inputColumns.join(', ')}, ${exprs} FROM ${figure.table} ORDER BY ${figure.orderBy}`});
            const width = figure.inputColumns.length;
            out.push({id: figure.id + ':input', expected: figure.inputRows, actual: result.rows.map(row => row.slice(0, width))});
            figure.outputs.forEach((output, i) => out.push({id: figure.id + ':' + output.label, expected: output.values, actual: result.rows.map(row => row[width + i])}));
          }
        } else if (figure.kind === 'metric-card') {
          // 数值示例里不在课程结果行中的输入（合计、上月、去年同月等）：用其 check.sql 在课程数据上实际执行核对。
          for (const input of figure.example.inputs.filter(item => item.check)) {
            const result = await run({tables, setupSql, path, sql: input.check.sql});
            out.push({id: `${figure.id}:${input.name}`, expected: [[input.value]], actual: result.rows});
          }
        } else if (figure.kind === 'flow-map') {
          const norm = rows => rows.map(row => JSON.stringify(row)).sort();
          let count = 0;
          for (const variant of figure.variants || [{stages: figure.stages}]) for (const stage of variant.stages) for (const tbl of stage.tables) {
            const result = await run({tables, setupSql, path, sql: tbl.sql});
            count++;
            out.push({id: `${figure.id}:t${count}:columns`, expected: tbl.columns, actual: result.columns});
            out.push({id: `${figure.id}:t${count}:rows`, expected: tbl.ordered ? tbl.rows : norm(tbl.rows), actual: tbl.ordered ? result.rows : norm(result.rows)});
          }
        } else if (figure.kind === 'page-map') {
          const main = await run({tables, setupSql, path, sql: `SELECT ${figure.columns.join(', ')} FROM ${figure.table} ORDER BY ${figure.orderBy} LIMIT ${figure.example.limit} OFFSET ${figure.example.offset}`});
          out.push({id: `${figure.id}:example`, expected: figure.rows.slice(figure.example.offset, figure.example.offset + figure.example.limit), actual: main.rows});
          for (const page of figure.pages) {
            const result = await run({tables, setupSql, path, sql: `SELECT ${figure.columns.join(', ')} FROM ${figure.table} ORDER BY ${figure.orderBy} LIMIT ${figure.pageSize} OFFSET ${page.offset}`});
            out.push({id: `${figure.id}:page${page.page}`, expected: figure.rows.slice(page.offset, page.offset + figure.pageSize), actual: result.rows});
          }
        } else if (figure.kind === 'compare-card') {
          for (const [index, panel] of figure.panels.entries()) {
            const result = await run({tables, setupSql, path, sql: panel.check.sql});
            out.push({id: `${figure.id}:panel${index + 1}`, expected: panel.check.expected, actual: result.rows});
          }
        } else if (figure.kind === 'join-map') {
          const result = await run({tables, setupSql, path, sql: figure.sql});
          const norm = rows => rows.map(row => JSON.stringify(row)).sort();
          const shownRight = figure.right.show.length;
          out.push({id: figure.id, expected: norm(figure.pairs.filter(pair => pair.kept).map(pair => [...(pair.left || Array(figure.left.show.length).fill(null)), ...(pair.right || Array(shownRight).fill(null))])), actual: norm(result.rows)});
        } else if (figure.kind === 'clause-map') {
          const result = await run({tables, setupSql, path, sql: figure.sql});
          out.push({id: figure.id, expected: lesson.result.rows, actual: lesson.result.totalRows > lesson.result.rows.length ? result.rows.slice(0, lesson.result.rows.length) : result.rows});
        }
      }
      return out;
    } finally { worker.terminate(); }
  });
  for (const item of report) assert.deepEqual(item.actual, item.expected, item.id);
  assert.deepEqual(errors, []);
  console.log(`Figures verified by execution: ${report.length} checks.`);
} finally { await browser.close(); }
