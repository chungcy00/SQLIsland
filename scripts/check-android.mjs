import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const adb='.tooling/sdk/platform-tools/adb';
const pid=execFileSync(adb,['shell','pidof','cn.sqlstudy.offline'],{encoding:'utf8'}).trim();
execFileSync(adb,['forward','tcp:9223','localabstract:webview_devtools_remote_'+pid]);
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map();socket.addEventListener('message',({data})=>{const message=JSON.parse(data);if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);if(message.error)item.reject(Error(message.error.message));else if(message.result.exceptionDetails)item.reject(Error(message.result.exceptionDetails.text));else item.resolve(message.result.result?.value);}});
function evaluate(expression){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});}
const wait=selector=>evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(document.querySelector(${JSON.stringify(selector)})){clearInterval(timer);resolve(true)}else if(Date.now()-start>25000){clearInterval(timer);reject(Error(document.body.innerText))}},100)})`);
async function route(path){await evaluate('location.hash='+JSON.stringify(path));await wait('.appbar');await evaluate('new Promise(resolve=>setTimeout(resolve,300))');}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
try{
 await wait('.continue');assert.equal(await evaluate('document.querySelector(".hero")===null'),true);
 const bounds=await evaluate('({top:document.querySelector(".appbar").getBoundingClientRect().top,height:innerHeight,width:innerWidth})');
 await route('/lesson/kp01-01');await wait('[data-action=lessonRun]');await click('[data-action=lessonRun]');await evaluate(`new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(document.querySelector('#lesson-result').innerText.includes('本次 SQLite')){clearInterval(timer);resolve(true)}},100);setTimeout(()=>{clearInterval(timer);reject(Error(document.body.innerText))},20000)})`);
 await click('[data-action=completeLesson]');
 await route('/question/q0002');await wait('[data-action=option]');await click('[data-action=option][data-arg=C]');await click('[data-action=submitQuestion]');assert.match(await evaluate('document.body.innerText'),/回答正确/);
 await route('/question/q0009');await click('.tabs [data-arg=代码]');await wait('#sql-editor');await evaluate(`(()=>{const input=document.querySelector('#sql-editor');input.value='SELECT DISTINCT price FROM products ORDER BY price';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await click('[data-action=submitQuestion]');await evaluate('new Promise(resolve=>setTimeout(resolve,1800))');assert.match(await evaluate('document.body.innerText'),/回答正确/);
 await route('/cards');await click('[data-action=startCards][data-arg=每日到期]');await wait('[data-action=flip]');await click('[data-action=flip]');await wait('[data-action=rate]');await click('[data-action=rate][data-arg="3"]');
 await route('/lab');await wait('#sql-editor');await click('[data-action=runLab]');await wait('.table-wrap');
 await route('/');
 const report={pass:true,android:execFileSync(adb,['shell','getprop','ro.build.version.release'],{encoding:'utf8'}).trim(),api:execFileSync(adb,['shell','getprop','ro.build.version.sdk'],{encoding:'utf8'}).trim(),viewport:bounds,flows:['APK冷启动','课程兼容SQL','本地课程进度','选择题提交','SQL独立夹具判题','FSRS四级评级','实验室真实查询','首页精简区域删除']};
 await writeFile('artifacts/android16-validation.json',JSON.stringify(report,null,2));console.log(report);
}finally{socket.close();}
