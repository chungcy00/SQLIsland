import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {root,readJson,loadCourseStructures} from './course-structure-resources.mjs';
const chapters=await Promise.all(Array.from({length:20},(_,i)=>readJson(`${root}/courses/ch${String(i+1).padStart(2,'0')}.json`)));
const status=await loadCourseStructures(chapters);
const records=await readJson(root+'/source/batch1/执行记录.json');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:4173/');await page.locator('.appbar').waitFor();
 const report=await page.evaluate(async records=>{
  const content=await(await fetch('content.json')).json();
  const lessons=new Map(content.chapters.flatMap(c=>c.knowledgePoints).map(k=>[k.id,k]));
  const worker=new Worker('sql-worker.js');let sequence=0;const calls=new Map();
  worker.onmessage=({data})=>{const call=calls.get(data.id);calls.delete(data.id);data.error?call.reject(Error(data.error)):call.resolve(data.result);};
  const execute=payload=>new Promise((resolve,reject)=>{const id=++sequence;calls.set(id,{resolve,reject});worker.postMessage({id,action:'lesson',payload});});
  const results=[];
  try{
   for(const item of records){
    const lesson=lessons.get(item.id);const p=lesson.presentation;
    const extension=p.extensions.find(e=>e.label===item.label);
    const sql=extension?.sql||p.completeCode.sqliteSql;
    if(sql!==item.sql)throw Error(item.id+' executable code differs from original execution record');
    const result=await execute({tables:extension?.sourceTables||lesson.sourceTables,setupSql:lesson.setupSql,sql});
    results.push({id:item.id,label:item.label,actual:{columns:result.columns,rows:result.rows}});
   }
   return results;
  }finally{worker.terminate();}
 },records);
 for(const [index,result]of report.entries())assert.deepEqual(result.actual,records[index].result,result.id+' '+result.label);
 assert.deepEqual(errors,[]);
 const output={resourceVersion:status.resourceVersion,converted:status.converted,pending:status.pending,checks:{sourceHashes:true,conceptTextPreserved:true,fragmentMatches:true,mainAndExtensionExecutions:report.length,browserErrors:errors},executions:report};
 await fs.writeFile(root+'/validation/structured-courses.json',JSON.stringify(output,null,2)+'\n');
 console.log(`Structured ${status.converted.length}/80; pending ${status.pending.length}; ${report.length} original execution records matched in app worker.`);
}finally{await browser.close();}
