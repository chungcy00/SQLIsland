import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root, hash, readJson, loadCourseStructures} from '../scripts/course-structure-resources.mjs';
import {validateStructuredLesson} from '../src/lesson-structure.js';
const chapters = await Promise.all(Array.from({length:20},(_,i)=>readJson(path.join(root,'courses',`ch${String(i+1).padStart(2,'0')}.json`))));
const status = await loadCourseStructures(chapters);
const all = chapters.flatMap(c=>c.knowledgePoints);
const converted = all.filter(k=>k.presentation);
test('archived source, saved blocks and original course fields agree for the imported batch', async () => {
  assert.equal(all.length,80);assert.equal(status.converted.length,7);assert.equal(status.pending.length,73);
  for (const k of converted) {
    validateStructuredLesson(k,k.presentation);
    assert.equal(k.teaching.presentation,undefined);
    assert.equal(k.presentation.cuts,undefined);
    assert.equal(k.presentation.heads,undefined);
    const source=await readJson(path.join(root,k.presentation.sourcePath));
    const {presentation,...fields}=k;
    assert.deepEqual(fields,source);
  }
  const patch=await readJson(path.join(root,'source/batch1/课程字段补丁.json'));
  for(const item of patch){
    const k=structuredClone(all.find(k=>k.id===item.id));
    if(item.id==='kp05-01')delete k.teaching.mergeExamples.at(-1).sourceTables;
    for(const [field,value] of Object.entries(item))assert.deepEqual(k[field],value,item.id+' '+field);
  }
});
test('structure validation rejects omitted knowledge, invented fragments and divergent executable SQL', () => {
  const k=converted[0];
  const broken=change=>{const p=structuredClone(k.presentation);change(p);assert.throws(()=>validateStructuredLesson(k,p));};
  broken(p=>p.conceptBlocks=p.conceptBlocks.filter(b=>b.type!=='list'));
  broken(p=>p.completeCode.sqliteSql='SELECT 1');
  broken(p=>p.expectedResult.rows=[]);
  broken(p=>p.breakdown[0].sql='JOIN fabricated ON 1=1');
  broken(p=>p.breakdown[0].kind='runnable');
  broken(p=>p.cautions.reason=structuredClone(p.cautions.comparison));
  broken(p=>p.dataDescriptions.fabricated='not a source table');
});
test('reimporting an already converted resource is a no-op', async () => {
  const file=path.join(root,'structured/lessons/kp01-01.json');
  const before=hash(await fs.readFile(file));
  const result=spawnSync(process.execPath,['scripts/import-course-structure.mjs',file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/unchanged; skipped/);
  assert.equal(hash(await fs.readFile(file)),before);
});
