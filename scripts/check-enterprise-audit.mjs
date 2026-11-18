import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import initSqlJs from 'sql.js';
import { initializeFixture, query, compareResults, checkStructure } from '../src/engine.js';
const SQL = await initSqlJs();
const content = JSON.parse(await readFile('dist/content.json'));
const manifest = JSON.parse(await readFile('dist/databases.json'));
const questions = content.questions.filter(q => /^q0(25[1-9]|2[6-9]\d|300)$/.test(q.id));
assert.equal(questions.length, 50);
assert.equal(content.questions.length, 300);
assert.equal(content.cards.length, 200);
const bases = new Map();
const shared = new Map();
const report = { pass: true, contentVersion: content.contentVersion, sqliteVersion: null, environment: '本机Node.js sql.js WASM，完整取数，不能代表实体手机耗时', databaseHashes: {}, semanticInputs: [], questions: [] };
report.integerPolicySha256 = createHash('sha256').update(await readFile('src/integer-column-policy.json')).digest('hex');
for (const dataset of manifest.datasets) {
  const bytes = await readFile('dist/' + dataset.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, dataset.sha256);
  report.databaseHashes[dataset.path] = hash;
  bases.set(dataset.path, new Uint8Array(bytes));
}
for (const q of questions) {
  const record = { id: q.id, task: q.taskId, fixtures: [], fullSubmissionMs: 0 };
  report.semanticInputs.push({ id: q.id, solutions: q.referenceSolutions.map(r => r.mysqlSql), fixtures: q.testFixtures.map(f => ({ path: f.path, sha256: f.sha256 })), tolerance: q.numericTolerance.absolute });
  const start = performance.now();
  for (const entry of q.testFixtures) {
    let fixture = JSON.parse(await readFile('dist/' + entry.path));
    if (fixture.sharedDataPath) {
      if (!shared.has(fixture.sharedDataPath)) shared.set(fixture.sharedDataPath, JSON.parse(await readFile('dist/' + fixture.sharedDataPath)));
      fixture = { ...shared.get(fixture.sharedDataPath), ...fixture };
    }
    const db = initializeFixture(SQL, fixture, bases.get(fixture.baseDatabase));
    if (!report.sqliteVersion) report.sqliteVersion = db.exec('SELECT sqlite_version()')[0].values[0][0];
    const caseResult = { id: entry.id, visibility: entry.visibility, references: [] };
    try {
      for (const reference of q.referenceSolutions) {
        const structure = checkStructure(reference.mysqlSql, q.requiredAstFeatures);
        assert.ok(structure.pass, q.id + ' ' + structure.message);
        const queryStart = performance.now();
        const actual = query(db, reference.mysqlSql, 50000);
        const elapsedMs = performance.now() - queryStart;
        const comparison = compareResults(actual, fixture.expected, q.orderPolicy, q.numericTolerance.absolute, q.numericTolerance.exactColumns);
        assert.ok(comparison.pass, q.id + ' ' + entry.id + ' ' + comparison.message);
        caseResult.references.push({ kind: reference.kind, pass: true, rows: actual.rows.length, elapsedMs: Number(elapsedMs.toFixed(3)) });
      }
    } finally { db.close(); }
    record.fixtures.push(caseResult);
  }
  record.fullSubmissionMs = Number((performance.now() - start).toFixed(3));
  report.questions.push(record);
}
report.correctExecutions = report.questions.reduce((total, q) => total + q.fixtures.reduce((sum, f) => sum + f.references.length, 0), 0);
await writeFile('artifacts/enterprise-audit/wasm-validation.json', JSON.stringify(report, null, 2));
console.log(`WASM passed for ${questions.length} enterprise questions, ${report.correctExecutions} reference/equivalent executions.`);
