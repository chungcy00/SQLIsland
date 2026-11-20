import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { initializeFixture, query, compareResults } from '../src/engine.js';
const SQL = await initSqlJs();
const content = JSON.parse(await readFile('dist/content.json'));
const databases = new Map();
const shared = new Map();
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const report = { version: '0.3.1', pass: true, checks: [], policyQuestions: 0 };
for (const question of content.questions) {
  const exactColumns = question.numericTolerance?.exactColumns || [];
  if (!exactColumns.length) continue;
  report.policyQuestions++;
  for (const entry of question.testFixtures) {
    let fixture = JSON.parse(await readFile('dist/' + entry.path));
    if (fixture.sharedDataPath) {
      if (!shared.has(fixture.sharedDataPath)) shared.set(fixture.sharedDataPath,
        JSON.parse(await readFile('dist/' + fixture.sharedDataPath)));
      fixture = { ...shared.get(fixture.sharedDataPath), ...fixture };
    }
    if (!fixture.expected?.rows?.length) continue;
    if (fixture.baseDatabase && !databases.has(fixture.baseDatabase)) {
      databases.set(fixture.baseDatabase, new Uint8Array(await readFile('dist/' + fixture.baseDatabase)));
    }
    const db = initializeFixture(SQL, fixture, databases.get(fixture.baseDatabase));
    try {
      const tolerance = question.numericTolerance.absolute;
      const reference = question.referenceSolutions[0].mysqlSql.trim().replace(/;\s*$/, '');
      for (const column of exactColumns) {
        const index = fixture.expected.columns.indexOf(column);
        if (!fixture.expected.rows.some(row => row[index] !== null)) continue;
        const projection = fixture.expected.columns.map(name =>
          name === column ? `${quote(name)} + ${tolerance / 2} AS ${quote(name)}` : quote(name)).join(', ');
        const actual = query(db, `WITH audit_result AS (${reference}) SELECT ${projection} FROM audit_result`, 50000);
        const previous = compareResults(actual, fixture.expected, question.orderPolicy, tolerance);
        const fixed = compareResults(actual, fixture.expected, question.orderPolicy, tolerance, exactColumns);
        assert.equal(fixed.pass, false, question.id + ' ' + column);
        report.checks.push({ question: question.id, fixture: entry.id, column,
          fractionalOffset: tolerance / 2, previouslyAccepted: previous.pass, nowRejected: !fixed.pass });
      }
    } finally { db.close(); }
    break;
  }
}
// 题库精简为 200 道后原先的 q0279 已不存在：改为要求至少有一次检查，且每次把整数列加上小数偏移后都被拒绝。
assert.ok(report.checks.length > 0);
assert.ok(report.checks.every(check => check.nowRejected), 'some fractional offsets are still accepted');
report.rejectedFractionalQueries = report.checks.length;
report.previouslyAcceptedQueries = report.checks.filter(check => check.previouslyAccepted).length;
await writeFile('artifacts/enterprise-audit/integer-policy-validation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ policyQuestions: report.policyQuestions, rejected: report.rejectedFractionalQueries,
  previouslyAccepted: report.previouslyAcceptedQueries }));
