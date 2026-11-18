#!/usr/bin/env python3
# 复验整合版，不依赖原始制作目录和网络。题库复验会创建临时数据库副本。
from pathlib import Path
import json,sqlite3,hashlib,collections,itertools,subprocess,sys,importlib.util
R=Path(__file__).resolve().parent;C=R/'courses_resource';Q=R/'question_resource';F=R/'flashcard_resource';E=R/'enterprise_reference'
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def execute_snippet(connection, sql):
 buffer=''
 cursor=None
 for line in sql.splitlines(keepends=True):
  buffer+=line
  if sqlite3.complete_statement(buffer):
   cursor=connection.execute(buffer.strip())
   buffer=''
 return connection.execute(buffer.strip()) if buffer.strip() else cursor
def main():
 for row in load(R/'manifest.json')['files']:
  p=R/row['path'];assert p.is_file() and sha(p)==row['sha256'],row['path']
 ks=[k for p in sorted((C/'courses').glob('ch*.json')) for k in load(p)['knowledgePoints']];qs=[q for p in sorted((Q/'questions').glob('ch*.json')) for q in load(p)['questions']];fs=[f for p in sorted((F/'flashcards').glob('ch*.json')) for f in load(p)['cards']]
 counts=load(R/'manifest.json')['counts']
 ki={k['id']:k for k in ks};qi={q['id']:q for q in qs};fi={f['id']:f for f in fs};assert len(ks)==len(ki)==counts['knowledgePoints'] and len(qs)==len(qi)==counts['questions'] and len(fs)==len(fi)==counts['flashcards']
 assert [len(load(Q/'questions'/f'ch{i:02}.json')['questions']) for i in range(1,21)]==[entry['count'] for entry in load(Q/'manifest.json')['chapters']]
 migration=load(C/'curriculum-migration.json')
 expected_mappings={(source,target) for source,targets in migration['targets'].items() for target in targets}
 teaching_mappings=[(item['sourceId'],k['id']) for k in ks for item in k['teaching']['mergedConcepts'] if item['explanation'].strip()]
 assert len(teaching_mappings)==len(set(teaching_mappings)) and set(teaching_mappings)==expected_mappings
 assert not set(ki).intersection(set(migration['targets'])|set(migration['removed']))
 assert all(set(k.get(field,[]))<=ki.keys() for k in ks for field in ('prerequisites','relatedKnowledgePointIds'))
 assert all(set(q.get(field,[]))<=ki.keys() for q in qs for field in ('knowledgePointIds','primaryKnowledgePointIds','prerequisiteKnowledgePointIds'))
 for k in ks:
  assert set(k['relatedQuestionIds'])=={q['id'] for q in qs if k['id'] in q['knowledgePointIds']};assert set(k['relatedFlashcardIds'])=={f['id'] for f in fs if k['id'] in f['knowledgePointIds']};assert set(k['primaryQuestionIds'])=={q['id'] for q in qs if k['id'] in q['primaryKnowledgePointIds']};assert set(k['primaryFlashcardIds'])=={f['id'] for f in fs if k['id'] in f['primaryKnowledgePointIds']};assert (C/k['mysqlVerificationScript']).is_file()
 for q in qs:
  assert set(q['relatedFlashcardIds'])=={f['id'] for f in fs if q['id'] in f['relatedQuestionIds']}
  if q.get('expectedOutputPath'):assert (Q/q['expectedOutputPath'].split('#')[0]).is_file()
 db={x['id']:Q/x['path'] for x in load(Q/'databases/manifest.json')['datasets']};conns={};passed=0;theory=0;biz=0
 for k in ks:
  sql=k['sqliteSql'];res=k['result']
  if not sql:theory+=1;continue
  if k.get('taskId'):
   tid=k['taskId'];t=load(E/'business_tasks'/f'{tid}.json');d=k['datasetId']
   assert d==t['datasetId'] and sql==t['sqliteSql'] and k['mysqlSql']==t['mysqlSql'],k['id']
   if d not in conns:conns[d]=sqlite3.connect(db[d].as_uri()+'?mode=ro',uri=True)
   cur=conns[d].execute(sql);rows=[list(x) for x in cur];cols=[x[0] for x in cur.description];full=load(C/res['fullResultPath'])
   assert rows==full['rows'] and cols==full['columns'],k['id']
   assert rows[:len(res['rows'])]==res['rows'] and len(rows)==res['totalRows'];biz+=1
  else:
   c=sqlite3.connect(':memory:',isolation_level=None);c.execute('PRAGMA foreign_keys=ON');c.create_function('IF',3,lambda cond,yes,no:yes if cond else no)
   for fid in k['fixtureIds']:
    f=load(C/'fixtures'/f'{fid}.json');c.execute('CREATE TABLE "'+f['table']+'"('+','.join('"'+a['name']+'" '+a['sqliteType'] for a in f['columns'])+')');c.executemany('INSERT INTO "'+f['table']+'" VALUES('+','.join('?' for _ in f['columns'])+')',f['rows'])
   c.commit()
   if k.get('setupSql'):c.executescript(k['setupSql'])
   cur=c.execute(sql);assert [list(x) for x in cur]==res['rows'] and [x[0] for x in cur.description]==res['columns'],k['id']
  for step in k.get('teaching',{}).get('checkpoints',[]):
   connection=conns[k['datasetId']] if k.get('datasetId') else c
   cursor=connection.execute(step['sql'])
   assert [col[0] for col in cursor.description]==step['result']['columns'] and [list(row) for row in cursor]==step['result']['rows'],(k['id'],step['name'])
  for step in k.get('teaching',{}).get('mergeExamples',[]):
   cursor=execute_snippet(conns[k['datasetId']] if k.get('datasetId') else c, step['sql'])
   assert [col[0] for col in cursor.description]==step['result']['columns'] and [list(row) for row in cursor]==step['result']['rows'],(k['id'],step['label'])
  if not k.get('taskId'):c.close()
  passed+=1
 for c in conns.values():c.close()
 assert passed+theory==counts['knowledgePoints']
 em=sqlite3.connect(db['enterprise-v2'].as_uri()+'?mode=ro',uri=True);shared=0
 for id,p in db.items():
  c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True);assert c.execute('PRAGMA integrity_check').fetchall()==[('ok',)] and not c.execute('PRAGMA foreign_key_check').fetchall()
  if id!='enterprise-v2':
   for t, in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
    n=len(c.execute('PRAGMA table_info("'+t+'")').fetchall());s='SELECT * FROM "'+t+'" ORDER BY '+','.join(map(str,range(1,n+1)));assert all(a==b for a,b in itertools.zip_longest(c.execute(s),em.execute(s)));shared+=1
  c.close()
 spec=importlib.util.spec_from_file_location('enterprise_business_checks',E/'validation/business_checks.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 for x in module.business_checks(em):assert x['pass'],x['name']
 for x in load(E/'validation/checks.json')['retainedSqlChecks']:assert em.execute(x['sql']).fetchone()[0]==0,x['name']
 em.close();print('课程',passed,'理论',theory,'业务',biz,'共享表核对',shared,flush=True)
 # 原验证程序会刷新 recheck.json；重新运行后如日志内容改变，应重建发布清单，而非把旧清单当成新版本。
 for p in [Q/'validation/verify_bank.py',F/'validation/verify_flashcards.py']:subprocess.run([sys.executable,str(p)],check=True)
 print('整合复验通过；原生 MySQL 未执行。',flush=True)
if __name__=='__main__':main()
