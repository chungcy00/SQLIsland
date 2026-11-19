import json,sqlite3,pathlib
p=pathlib.Path(__file__).parent
c=sqlite3.connect(':memory:')
for n,(cols,rows) in json.loads((p/'fixtures.json').read_text()).items():
 c.execute('CREATE TABLE '+n+' ('+','.join('"'+x+'"' for x in cols)+')')
 c.executemany('INSERT INTO '+n+' VALUES ('+','.join('?' for _ in cols)+')',rows)
for e in json.loads((p/'执行记录.json').read_text()):
 cur=c.execute(e['sql']); actual={'columns':[x[0] for x in cur.description],'rows':[list(r) for r in cur.fetchall()]}
 assert actual==e['result'],e['id']
 print(e['id'],e['label'],'通过')
