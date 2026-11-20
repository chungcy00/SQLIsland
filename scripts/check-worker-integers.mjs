// 浏览器 SQL Worker 的整数列判分：参考解与等价解应通过；把“必须是整数”的列加上小数偏移后必须被拒绝。
// 题库精简为 200 道后，原先针对 q0279 的专用断言已不存在，改为在有整数列策略且至少两种参考解的题里取第一道。
// 需要先 `npm run preview`（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const result = await page.evaluate(async () => {
    const content = await (await fetch('content.json')).json();
    const question = content.questions.find(item => item.numericTolerance?.exactColumns?.length && item.referenceSolutions?.length >= 2 && item.testFixtures?.length);
    if (!question) throw Error('No question with an integer-column policy and two reference solutions');
    let fixture = await (await fetch(question.testFixtures[0].path)).json();
    if (fixture.sharedDataPath) fixture = { ...(await (await fetch(fixture.sharedDataPath)).json()), ...fixture };
    const columns = fixture.expected.columns;
    const column = question.numericTolerance.exactColumns.find(name => columns.includes(name));
    const worker = new Worker('sql-worker.js');
    let sequence = 0;
    function submit(sql) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => reject(Error('Worker grading timed out')), 60000);
        worker.onmessage = ({ data }) => {
          if (data.id !== id) return;
          clearTimeout(timer);
          data.error ? reject(Error(data.error)) : resolve(data.result);
        };
        worker.postMessage({ id, action: 'exercise', payload: { question, sql, submit: true } });
      });
    }
    const quote = name => '"' + name.replaceAll('"', '""') + '"';
    try {
      const reference = question.referenceSolutions[0].mysqlSql.trim().replace(/;\s*$/, '');
      const correct = await submit(question.referenceSolutions[0].mysqlSql);
      const equivalent = await submit(question.referenceSolutions[1].mysqlSql);
      const projection = columns.map(name => name === column ? `${quote(name)} + 0.005 AS ${quote(name)}` : quote(name)).join(', ');
      const wrong = await submit(`WITH audit_result AS (${reference}) SELECT ${projection} FROM audit_result`);
      return { question: question.id, column, correct: correct.pass, equivalent: equivalent.pass, wrongRejected: wrong.pass === false, correctFixtures: correct.fixtures };
    } finally { worker.terminate(); }
  });
  assert.equal(result.correct, true);
  assert.equal(result.equivalent, true);
  assert.equal(result.wrongRejected, true);
  assert.ok(result.correctFixtures >= 1);
  await writeFile(process.env.SQL_AUDIT_OUTPUT || 'artifacts/enterprise-audit/worker-integer-validation.json', JSON.stringify({ pass: true, ...result }, null, 2));
  console.log(`Actual browser Worker accepted ${result.question} correct/equivalent solutions and rejected a fractional ${result.column}.`);
} finally { await browser.close(); }
