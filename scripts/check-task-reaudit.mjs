import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { initializeFixture, query, compareResults } from '../src/engine.js';
const SQL = await initSqlJs();
const content = JSON.parse(await readFile('dist/content.json'));
const candidates = JSON.parse(await readFile('artifacts/task-reaudit-20261118/wrong-solutions.json'));
const bases = new Map();
const shared = new Map();
const report = { pass: true, contentVersion: content.contentVersion, cases: [] };
for (const task of candidates) {
  const question = content.questions.find(q => q.id === task.question);
  const domainError = task.queries.find(q => q.rejectedByResult && !['硬编码最新公开结果', '上一版答案'].includes(q.label));
  const hardcode = task.queries.find(q => q.label === '硬编码最新公开结果');
  assert.ok(domainError && hardcode?.rejectedByResult, question.id);
  for (const candidate of [domainError, hardcode]) {
    const counterexample = candidate.attempts.find(a => a.executed && a.accepted === false);
    const entry = question.testFixtures.find(f => f.id === counterexample.fixture);
    let fixture = JSON.parse(await readFile('dist/' + entry.path));
    if (fixture.sharedDataPath) {
      if (!shared.has(fixture.sharedDataPath)) shared.set(fixture.sharedDataPath,
        JSON.parse(await readFile('dist/' + fixture.sharedDataPath)));
      fixture = { ...shared.get(fixture.sharedDataPath), ...fixture };
    }
    if (fixture.baseDatabase && !bases.has(fixture.baseDatabase)) {
      bases.set(fixture.baseDatabase, new Uint8Array(await readFile('dist/' + fixture.baseDatabase)));
    }
    const db = initializeFixture(SQL, fixture, bases.get(fixture.baseDatabase));
    try {
      const actual = query(db, candidate.sql, 50000);
      const result = compareResults(actual, fixture.expected, question.orderPolicy,
        question.numericTolerance.absolute, question.numericTolerance.exactColumns,
        question.numericTolerance.columnAbsolute);
      assert.equal(result.pass, false, question.id + ' ' + candidate.label);
      report.cases.push({ question: question.id, label: candidate.label, fixture: entry.id,
        executed: true, rejectedByResult: true, actualRows: actual.rows.length,
        expectedRows: fixture.expected.rows.length });
    } finally { db.close(); }
  }
}
report.questions = candidates.length;
report.resultRejections = report.cases.length;
await writeFile('artifacts/task-reaudit-20261118/wasm-wrong-solutions.json', JSON.stringify(report, null, 2));
console.log(`${report.questions} enterprise questions rejected ${report.resultRejections} executable wrong/hardcoded queries in WASM.`);
