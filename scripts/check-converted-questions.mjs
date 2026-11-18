import assert from 'node:assert/strict';
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { initializeFixture, query, compareResults, checkStructure } from '../src/engine.js';
const SQL=await initSqlJs();
const root='resources/CONTENT/question_resource/';
const questions=fs.readdirSync(root+'questions').sort().flatMap(name=>JSON.parse(fs.readFileSync(root+'questions/'+name)).questions).filter(q=>q.previousExecutionMode==='predict_public_result');
assert.equal(questions.length,15);
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const quoted=name=>'"'+name.replaceAll('"','""')+'"';
const records=[];
for(const q of questions){
 assert.equal(q.type,'独立编写');assert.equal(q.initialCode,'');assert.equal(q.executionMode,'query_result');assert.equal(q.runAllowedBeforeSubmit,true);
 const pub=JSON.parse(fs.readFileSync(root+q.testFixtures.find(f=>f.visibility==='public').path)).expected;
 const hardcoded=pub.rows.map(row=>'SELECT '+row.map((value,index)=>literal(value)+' AS '+quoted(pub.columns[index])).join(', ')).join(' UNION ALL ');
 let hardcodedRejected=false,wrongRejected=false;
 const fixtures=[];
 for(const entry of q.testFixtures){
  const fixture=JSON.parse(fs.readFileSync(root+entry.path));
  const db=initializeFixture(SQL,fixture);
  try{
   const results=q.referenceSolutions.slice(0,2).map(solution=>{
    assert.equal(checkStructure(solution.mysqlSql,q.requiredAstFeatures).pass,true,q.id);
    const actual=query(db,solution.mysqlSql);
    assert.equal(compareResults(actual,fixture.expected,q.orderPolicy,q.numericTolerance?.absolute,q.numericTolerance?.exactColumns,q.numericTolerance?.columnAbsolute).pass,true,q.id+' '+entry.id);
    return {kind:solution.kind,pass:true,rows:actual.rows.length};
   });
   const expected=query(db,q.referenceSolutions[0].sqliteSql);assert.deepEqual(expected.columns,fixture.expected.columns);assert.deepEqual(expected.rows,fixture.expected.rows);
   const hardcodedPass=compareResults(query(db,hardcoded),fixture.expected,q.orderPolicy,q.numericTolerance?.absolute,q.numericTolerance?.exactColumns).pass;
   if(entry.visibility==='hidden'&&!hardcodedPass)hardcodedRejected=true;
   let wrongPass=false;try{wrongPass=compareResults(query(db,q.commonErrors.find(e=>e.sql).sql),fixture.expected,q.orderPolicy,q.numericTolerance?.absolute,q.numericTolerance?.exactColumns).pass;}catch{}
   if(!wrongPass)wrongRejected=true;
   fixtures.push({id:entry.id,visibility:entry.visibility,reference:results[0],equivalent:results[1],hardcodedPass,wrongPass,expectedRecomputed:true});
  }finally{db.close();}
 }
 assert.ok(hardcodedRejected,q.id+' hardcoded');assert.ok(wrongRejected,q.id+' wrong SQL');
 records.push({id:q.id,title:q.title,type:q.type,fixtures,hardcodedRejected,wrongRejected});
}
console.log(`${records.length} retained conversions, ${records.reduce((count, item) => count + item.fixtures.length, 0)} verified fixtures, and per-question wrong/hardcoded rejection passed`);
