import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {root, readJson, loadCourseStructures} from '../scripts/course-structure-resources.mjs';
import {validateFigures} from '../src/figure-structure.js';
import {renderFigures, rowFlowStep} from '../src/figures.js';
const chapters = await Promise.all(Array.from({length:20},(_,i)=>readJson(path.join(root,'courses',`ch${String(i+1).padStart(2,'0')}.json`))));
await loadCourseStructures(chapters);
const lessons = chapters.flatMap(c=>c.knowledgePoints);
const pilot = lessons.find(k=>k.id==='kp05-01');
const data = await readJson(path.join(root,'structured/figures/kp05-01.json'));
const fresh = () => structuredClone(data);
test('pilot figures load only for converted lessons and match the sample data', () => {
  assert.equal(pilot.figures.length, 3);
  const withFigures = lessons.filter(k=>k.figures);
  assert.ok(withFigures.every(k=>k.presentation));
  for (const id of ['kp01-01','kp01-02','kp01-03','kp02-01','kp02-02','kp05-01','kp05-02']) assert.ok(withFigures.some(k=>k.id===id), id);
  assert.ok(withFigures.length >= 70);
  validateFigures(pilot, fresh());
});
test('figure validation rejects numbers that differ from the lesson data', () => {
  let bad = fresh(); bad.figures[0].rows[1].value = 1;
  assert.throws(()=>validateFigures(pilot, bad), /differs from sample data|does not cover concept table row/);
  bad = fresh(); bad.figures[0].rows.pop();
  assert.throws(()=>validateFigures(pilot, bad), /rows count/);
  bad = fresh(); bad.figures[1].parts[2].sql = 'WHERE value = 10';
  assert.throws(()=>validateFigures(pilot, bad), /rebuild the query/);
  bad = fresh(); bad.figures[2].steps[1].keptKeys = [2, 9];
  assert.throws(()=>validateFigures(pilot, bad), /subset/);
  bad = fresh(); bad.figures[2].steps.pop();
  assert.throws(()=>validateFigures(pilot, bad), /last step|match the breakdown/);
  bad = fresh(); bad.figures[2].steps[2].label = 'SELECT *';
  assert.throws(()=>validateFigures(pilot, bad), /label differs/);
  bad = fresh(); bad.figures[2].steps[3].sql = 'SELECT 1';
  assert.throws(()=>validateFigures(pilot, bad), /full query/);
  bad = fresh(); bad.figures[0].rows[1].truth = 'false';
  assert.throws(()=>validateFigures(pilot, bad), /does not cover concept table row/);
  bad = fresh(); bad.figures[0].rows[0].truth = 'maybe';
  assert.throws(()=>validateFigures(pilot, bad), /truth/);
});
test('figures render real text labels and escape content', () => {
  const html = ['concept','syntax','breakdown'].map(slot=>renderFigures(pilot, slot)).join('');
  for (const text of ['未知','真','假','取数','筛选','排序']) assert.ok(html.includes(text), text);
  assert.deepEqual([0,1,2,3].map(i=>rowFlowStep(pilot,i).badge), ['4 行','4 → 1 行','1 → 1 行','1 → 1 行']);
  assert.ok(rowFlowStep(pilot,1).html.includes('排除'));
  assert.equal(rowFlowStep(pilot,4), null);
  assert.equal(renderFigures(pilot,'breakdown'), '');
  assert.ok(html.includes('value &lt;&gt; 10'));
  assert.ok(!html.includes('<svg'));
  assert.equal(renderFigures({figures: [], sourceTables: []}, 'concept'), '');
});

const others = ['kp01-01','kp01-02','kp01-03','kp02-01','kp02-02','kp05-02'];
test('every figure file is bound to its lesson and its last step equals the lesson result', async () => {
  for (const id of others) {
    const lesson = lessons.find(k=>k.id===id);
    const file = await readJson(path.join(root,`structured/figures/${id}.json`));
    validateFigures(lesson, structuredClone(file));
    const flow = lesson.figures.find(f=>f.kind==='stage-flow');
    assert.deepEqual(flow.steps.at(-1).rows, lesson.result.rows, id);
    assert.equal(flow.steps.length, lesson.presentation.breakdown.length, id);
    const badges = lesson.presentation.breakdown.map((_, i)=>rowFlowStep(lesson, i)?.badge);
    assert.ok(badges.filter(Boolean).length >= 2, id);
    assert.match(renderFigures(lesson, 'syntax'), /取数/, id);
  }
});
test('stage-flow validation rejects data that differs from the sample or the lesson result', async () => {
  const lesson = lessons.find(k=>k.id==='kp02-02');
  const file = await readJson(path.join(root,'structured/figures/kp02-02.json'));
  let bad = structuredClone(file); bad.figures[1].steps[0].rows[0][2] = 999;
  assert.throws(()=>validateFigures(lesson, bad), /first step differs from sample data/);
  bad = structuredClone(file); bad.figures[1].steps.at(-1).rows.pop();
  assert.throws(()=>validateFigures(lesson, bad), /differs from the lesson result/);
  bad = structuredClone(file); bad.figures[1].steps[1].label = 'SELECT 1';
  assert.throws(()=>validateFigures(lesson, bad), /label differs/);
  bad = structuredClone(file); bad.figures[1].steps.pop();
  assert.throws(()=>validateFigures(lesson, bad), /must match the breakdown/);
  assert.equal(rowFlowStep(lesson,1).badge, '5 → 3 行');
  const join = lessons.find(k=>k.id==='kp01-03');
  assert.equal(rowFlowStep(join,1), null);
  assert.equal(rowFlowStep(join,2).badge, '5 → 4 行');
});
test('metric cards quote the lesson instead of inventing a definition', async () => {
  const lesson = lessons.find(k => k.id === 'kp19-41');
  const card = () => structuredClone(lesson.figures.find(figure => figure.kind === 'metric-card'));
  const check = figure => validateFigures(lesson, {schemaVersion: 1, id: lesson.id, figures: [figure]});
  check(card());
  let bad = card(); bad.numerator.expr = 'SUM(profit_cents)';
  assert.throws(() => check(bad), /not in the lesson query/);
  bad = card(); bad.scope[0].text = '2024年度线下订单';
  assert.throws(() => check(bad), /not quoted from the lesson problem/);
  bad = card(); bad.pitfall = '分母可以随意更换';
  assert.throws(() => check(bad), /not quoted from the lesson cautions/);
  bad = card(); bad.metric.column = 'unknown_pct';
  assert.throws(() => check(bad), /not a result column/);
  assert.match(renderFigures(lesson, 'problem'), /fig-formula/);
});
