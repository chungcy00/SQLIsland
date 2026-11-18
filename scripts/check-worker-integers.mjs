import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const result = await page.evaluate(async () => {
    const content = await (await fetch('content.json')).json();
    const question = content.questions.find(item => item.id === 'q0279');
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
    try {
      const correct = await submit(question.referenceSolutions[0].mysqlSql);
      const equivalent = await submit(question.referenceSolutions[1].mysqlSql);
      const sql = question.referenceSolutions[0].mysqlSql.trim().replace(/;\s*$/, '');
      const wrong = await submit(`WITH audit_result AS (${sql}) SELECT product_id + 0.005 AS product_id, supplier_id, weighted_price_cents, low_price_cents, premium_pct FROM audit_result`);
      const wrongPercent = await submit(`WITH audit_result AS (${sql}) SELECT product_id, supplier_id, weighted_price_cents, low_price_cents, premium_pct + 0.005 AS premium_pct FROM audit_result`);
      const averageEquivalent = await submit(question.referenceSolutions[0].mysqlSql.replaceAll('SUM(ordered_cents)', 'AVG(ordered_cents)').replaceAll('SUM(quantity_ordered)', 'AVG(quantity_ordered)'));
      return { averageRatioEquivalentAccepted: averageEquivalent.pass, percentageErrorRejected: wrongPercent.pass === false, question: question.id, correct: correct.pass, equivalent: equivalent.pass,
        wrongRejected: wrong.pass === false, correctFixtures: correct.fixtures,
        equivalentFixtures: equivalent.fixtures, wrongMessage: wrong.message };
    } finally { worker.terminate(); }
  });
  assert.equal(result.averageRatioEquivalentAccepted, true);
  assert.equal(result.percentageErrorRejected, true);
  assert.equal(result.correct, true);
  assert.equal(result.equivalent, true);
  assert.equal(result.wrongRejected, true);
  assert.equal(result.correctFixtures, 4);
  await writeFile(process.env.SQL_AUDIT_OUTPUT || 'artifacts/enterprise-audit/worker-integer-validation.json', JSON.stringify({ pass: true, ...result }, null, 2));
  console.log('Actual browser Worker accepted BP29 correct/equivalent solutions and rejected fractional product IDs.');
} finally { await browser.close(); }
