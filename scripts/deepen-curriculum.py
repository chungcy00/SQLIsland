"""Add the verified teaching excerpts and synchronize the course reading edition."""
from pathlib import Path
import json
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
C = ROOT / 'resources/CONTENT/courses_resource'
Q = ROOT / 'resources/CONTENT/question_resource'
EXPLANATIONS = ROOT / 'scripts/curriculum/lesson-explanations.tsv'
REWRITTEN = {'kp19-03':'q0265','kp20-01':'q0288','kp20-02':'q0290','kp20-03':'q0255'}

VIEW_CHECKPOINTS = {
    'kp19-47': [
        ('invoice_balance', """SELECT supplier_invoice_id,supplier_id,billed_cents,paid_cents,balance_cents
FROM v_invoice_balance"""),
        ('payment_classification', """SELECT supplier_invoice_id,balance_cents,
 CASE WHEN balance_cents=0 THEN 'paid' WHEN paid_cents=0 THEN 'unpaid'
      WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END AS payment_state
FROM v_invoice_balance"""),
    ],
    'kp19-57': [
        ('due_line_flags', """SELECT po_item_id,supplier_id,quantity_ordered,received,accepted,
 CASE WHEN on_time>=quantity_ordered THEN 1 ELSE 0 END AS ontime_flag,
 CASE WHEN accepted>=quantity_ordered THEN 1 ELSE 0 END AS complete_flag
FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31'"""),
        ('supplier_totals', """SELECT supplier_id,COUNT(*) AS due_lines,
 SUM(CASE WHEN on_time>=quantity_ordered THEN 1 ELSE 0 END) AS ontime_lines,
 SUM(CASE WHEN accepted>=quantity_ordered THEN 1 ELSE 0 END) AS complete_lines,
 SUM(accepted) AS accepted_units,SUM(received) AS received_units
FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY supplier_id"""),
    ],
}

def load(path):
    return json.loads(path.read_text())

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

def cte_checkpoints(sql):
    lead = re.match(r'\s*WITH\s+(?!RECURSIVE\b)',sql,re.I)
    if not lead:
        return []
    pattern = re.compile(r"""'(?:''|[^'])*'|"(?:[^"]|"")*"|`[^`]*`|--[^\n]*|/\*[\s\S]*?\*/|[()]""")
    checkpoints = []
    end = lead.end()
    while head := re.match(r'\s*([a-z_][a-z0-9_]*)\s+AS\s*\(',sql[end:],re.I):
        start = end+head.end()
        depth = 1
        for token in pattern.finditer(sql,start):
            if token[0]=='(':
                depth+=1
            if token[0]==')':
                depth-=1
                if not depth:
                    end=token.end()
                    break
        else:
            raise ValueError('Unbalanced CTE: '+sql)
        name=head[1]
        checkpoints.append((name,sql[:end]+f'\nSELECT * FROM {name} LIMIT 3;'))
        comma = re.match(r'\s*,',sql[end:])
        if not comma:
            break
        end+=comma.end()
    return checkpoints

def body(k, databases):
    if k.get('datasetId'):
        return sqlite3.connect(databases[k['datasetId']].as_uri()+'?mode=ro',uri=True)
    db=sqlite3.connect(':memory:')
    for table in k['sourceTables']:
        cols=','.join('"'+col['name']+'" '+(col.get('sqliteType') or col['type']) for col in table['columns'])
        db.execute('CREATE TABLE "'+table['name']+'" ('+cols+')')
        params=','.join('?' for col in table['columns'])
        db.executemany('INSERT INTO "'+table['name']+'" VALUES ('+params+')',table['rows'])
    if k.get('setupSql'):
        db.executescript(k['setupSql'])
    return db

def query(db, sql):
    cursor=None
    buffer=''
    for line in sql.splitlines(keepends=True):
        buffer+=line
        if sqlite3.complete_statement(buffer):
            cursor=db.execute(buffer.strip())
            buffer=''
    if buffer.strip():
        cursor=db.execute(buffer.strip())
    return {'columns':[col[0] for col in cursor.description],'rows':[list(row) for row in cursor]}

def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value,str):
        return "'"+value.replace("'","''")+"'"
    return str(value)

def refresh_rewritten(k,q):
    fixture=load(Q/'fixtures'/q['id']/(q['id']+'-directed-edge.json'))
    tables=fixture['tables']
    k['fixtureIds']=[]
    mysql=['-- 教学样本。用于空白测试库。']
    for table in tables:
        fid=k['id']+'-'+table['name']
        write(C/'fixtures'/f'{fid}.json', {'id':fid,'table':table['name'],'columns':table['columns'],'rows':table['rows']})
        k['fixtureIds'].append(fid)
        cols=', '.join('`'+col['name']+'` '+('BIGINT' if col['sqliteType']=='INTEGER' else 'VARCHAR(200)') for col in table['columns'])
        mysql.append('CREATE TABLE `'+table['name']+'` ('+cols+');')
        if table['rows']:
            vals=',\n'.join('('+', '.join(map(literal,row))+')' for row in table['rows'])
            mysql.append('INSERT INTO `'+table['name']+'` VALUES\n'+vals+';')
    mysql.extend([fixture['setupSql'],q['mysqlSql'].rstrip(';')+';'])
    (C/k['mysqlVerificationScript']).write_text('\n\n'.join(mysql)+'\n')
    k.update(sourceTables=tables,setupSql=fixture['setupSql'],mysqlSql=q['mysqlSql'],sqliteSql=q['sqliteSql'],
        executionSteps=q['executionSteps'],useCase=q['context'], learningObjective=q['title'],
        parameters={},comparison=q['explanation'],commonError={'example':q['commonErrors'][0]['reason'],'correction':q['hints'][1]},
        notes='示例采用可逐笔核对的小型数据，练习采用正式业务数据库。金额单位为马币分。',
        result={**fixture['expected'],'status':'SQLite实际执行','orderGuaranteed':True},
        mysqlVerification='未执行原生 MySQL')
    k['syntax']=k['mysqlSql']

def table_markdown(columns, rows):
    return '\n'.join(['| '+' | '.join(columns)+' |','| '+' | '.join(['---']*len(columns))+' |',*['| '+' | '.join('NULL' if value is None else str(value).replace('|','\\|') for value in row)+' |' for row in rows]])

def main():
    chapters={p:load(p) for p in sorted((C/'courses').glob('ch*.json'))}
    by_id={k['id']:k for chapter in chapters.values() for k in chapter['knowledgePoints']}
    questions={q['id']:q for name in ('ch19','ch20') for q in load(Q/'questions'/f'{name}.json')['questions']}
    versions=load(Q/'databases/manifest.json')
    dbs={x['id']:Q/x['path'] for x in versions['datasets']}
    explanations={parts[0]:parts[1:] for parts in (line.split('\t') for line in EXPLANATIONS.read_text().splitlines())}
    assert set('kp'+key for key in explanations)==set(by_id)
    headings={parts[0]:parts[1:] for parts in (line.split('\t') for line in EXPLANATIONS.with_name('checkpoint-labels.tsv').read_text().splitlines())}
    # Reuse the tested full business example for each consolidated target.
    originals=ROOT/'.tooling/before-curriculum-revision.zip'
    pairs={'kp19-01':'kp19-31','kp19-02':'kp19-37'}
    if any(not by_id[k].get('taskId') for k in pairs):
        import zipfile
        with zipfile.ZipFile(originals) as archive:
            source={k['id']:k for k in json.loads(archive.read('resources/CONTENT/courses_resource/courses/ch19.json'))['knowledgePoints']}
        keys=('concept','syntax','parameters','fixtureIds','sourceTables','mysqlSql','sqliteSql','executionSteps','useCase','comparison','commonError','notes','compatibility','mysqlVerification','result','mysqlVerificationScript','taskId','datasetId','difficulty')
        for target,old in pairs.items():
            by_id[target].update({key:source[old][key] for key in keys if key in source[old]})
    for kid,qid in REWRITTEN.items():
        refresh_rewritten(by_id[kid],questions[qid])
    report=[]
    for p,chapter in chapters.items():
        reading=[f"# 第{chapter['number']:02d}章 {chapter['title']}",f"阶段：{chapter['stage']}｜学习目标：{chapter['objective']}"]
        if 'advancedTaskIds' in chapter:
            chapter['advancedTaskIds']=[k['taskId'] for k in chapter['knowledgePoints'] if k.get('taskId')]
        for k in chapter['knowledgePoints']:
            why, method, meaning=explanations[k['id'][2:]]
            k['teaching']={'problem':why,'codeExplanation':method,'resultExplanation':meaning,'checkpoints':[]}
            candidates=cte_checkpoints(k['sqliteSql']) if k['sqliteSql'] and (chapter['number']>=19 or k['id'] in {'kp08-05','kp14-01','kp15-05'}) else []
            if k['id'] in VIEW_CHECKPOINTS:
                candidates = [(name,sql+' LIMIT 3;') for name,sql in VIEW_CHECKPOINTS[k['id']]]
            if candidates or k.get('datasetId'):
                with body(k,dbs) as db:
                    if k.get('datasetId'):
                        for source in k['sourceTables']:
                            source['rowCount']=db.execute('SELECT COUNT(*) FROM "'+source['name']+'"').fetchone()[0]
                    labels=headings[k['id'][2:]]
                    assert len(labels)==len(candidates),k['id']
                    for (name, sql),label in zip(candidates,labels):
                        columns=query(db,sql)['columns']
                        order=', '.join(str(i) for i in range(1,len(columns)+1))
                        sql=sql.removesuffix(' LIMIT 3;')+f' ORDER BY {order} LIMIT 3;'
                        result=query(db,sql)
                        k['teaching']['checkpoints'].append({'name':name,'label':label,'sql':sql,'result':result})
            result=k['result']
            report.append({'id':k['id'],'intermediateQueries':len(candidates),'finalExpectedRows':result.get('totalRows',len(result.get('rows',[]))) if result else None})
            lesson=[f"## {k['id']} {k['title']}",'### 核心概念',k['concept'],'### 语法']
            lesson+=['```sql\n'+k['syntax']+'\n```'] if k.get('syntax')!=k.get('mysqlSql') else []
            lesson=lesson if lesson[-1]!='### 语法' else lesson[:-1]
            if k['executionSteps']:
                lesson+=['### 执行思路','\n'.join(f'{i}. {step}' for i,step in enumerate(k['executionSteps'],1))]
            lesson+=['### 示例数据']
            for table in k['sourceTables']:
                lesson+=[table['name'],table_markdown([col['name'] for col in table['columns']],table['rows'][:5])]
            lesson+=['### SQL 示例',why,method]
            for step in k['teaching']['checkpoints']:
                lesson+=[f"**{step['label']}**",'```sql\n'+step['sql']+'\n```',table_markdown(step['result']['columns'],step['result']['rows'])]
            if k['mysqlSql']:
                lesson+=['```sql\n'+k['mysqlSql']+'\n```']
            if result and 'columns' in result:
                lesson+=['### 执行结果',table_markdown(result['columns'],result['rows'][:12]),meaning]
            lesson+=['### 辨析与易错点',k['comparison'],k['notes'],'关联题目：'+'、'.join(k['relatedQuestionIds']),'关联闪卡：'+'、'.join(k['relatedFlashcardIds'])]
            reading.extend(value for value in lesson if value)
        write(p,chapter)
        (C/'reading'/f'{p.stem}.md').write_text('\n\n'.join(reading)+'\n')
    write(C/'validation/curriculum-revision.json',{'lessons':report,'sqliteIntermediateQueries':sum(r['intermediateQueries'] for r in report),'mysqlNative':'未执行'})

if __name__=='__main__':
    main()
