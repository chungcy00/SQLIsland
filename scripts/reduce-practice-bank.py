"""Apply the user-provided 200-question whitelist without rewriting retained content."""
from pathlib import Path
from collections import Counter
import json
import re
import hashlib

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'resources/CONTENT'
Q = CONTENT / 'question_resource'
VERSION = '5.0.0'
WHITELIST = [
    '3 5 6 8', '9 11 12 14 16 17 18 19', '23 24 26 27 28 29 31-34 37 39-41',
    '43 44 45 48 49 50', '51 52 53 54 56 58 59 60', '61-65 67-70 72 74 75',
    '76-78 81-87 89-91 93', '94-99 101-103 106-109 111-118', '119-123 125-128 130',
    '131 132 134 136 138-142 144-146 148-150', '151 154-156 158 159',
    '162 163 165 166 169-172 174 175', '176-179 181 182', '188-190 192 194 195',
    '196 198-204 206 207 209 211 212 214 216-220', '221-224 226 227 229 230',
    '231 232 235', '241 244',
    '251 252 253 256 257 261 262 263 265 266 267 268 269 270 272 276 277 278',
    '255 282 284 288 289 290 291 294 297 299',
]
MIGRATIONS = {
    'kp02-01':[17,18,19], 'kp08-02':[102], 'kp08-04':[96,103], 'kp09-02':[122],
    'kp11-02':[156], 'kp12-01':[165,174], 'kp13-02':[178], 'kp13-01':[181],
    'kp15-04':[212], 'kp17-02':[232], 'kp18-01':[241],
    'kp19-01':[251], 'kp19-32':[252], 'kp19-33':[253], 'kp19-36':[256],
    'kp19-02':[257], 'kp19-41':[261], 'kp19-42':[262], 'kp19-43':[263],
    'kp19-03':[265], 'kp19-46':[266], 'kp19-47':[267], 'kp19-48':[268],
    'kp19-49':[269], 'kp19-50':[270], 'kp19-52':[272], 'kp19-56':[276],
    'kp19-57':[277], 'kp19-58':[278], 'kp20-01':[288], 'kp20-02':[290],
    'kp20-03':[255], 'kp20-06':[282], 'kp20-08':[284], 'kp20-13':[289],
    'kp20-15':[291], 'kp20-18':[294], 'kp20-21':[297], 'kp20-23':[299],
}
REWRITTEN = {'q0255','q0265','q0288','q0290'}

def load(path):
    return json.loads(path.read_text())

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def parse_whitelist():
    chapters = {}
    for index, text in enumerate(WHITELIST, 1):
        ids = []
        for part in text.split():
            numbers = list(map(int, part.split('-')))
            ids.extend(f'q{n:04d}' for n in range(numbers[0], numbers[-1]+1))
        chapters[f'ch{index:02d}'] = ids
    ids = sum(chapters.values(), [])
    assert len(ids) == len(set(ids)) == 200
    return chapters

def render_question(q):
    return f"""## {q['id']} · {q['title']}

{q['type']} · {q['difficulty']} · {', '.join(q['knowledgePointIds'])}

{q.get('context','')}

{q['requirements']}

### 提示

"""+'\n'.join(f'{i}. {hint}' for i,hint in enumerate(q['hints'],1))+f"""

### 参考解

```sql
{q['referenceSolutions'][0]['mysqlSql']}
```

### 等价解

```sql
{q['referenceSolutions'][1]['mysqlSql']}
```

### 解析

{q['explanation']}

"""

def main():
    whitelist = parse_whitelist()
    retained = set(sum(whitelist.values(), []))
    paths = sorted((Q/'questions').glob('ch*.json'))
    chapters = {path.stem: load(path) for path in paths}
    questions = {q['id']: q for chapter in chapters.values() for q in chapter['questions']}
    assert retained <= questions.keys(), sorted(retained-questions.keys())
    targets = {f'q{number:04d}':kp for kp,numbers in MIGRATIONS.items() for number in numbers}
    sections = {}
    for path in sorted((Q/'reading').glob('ch*.md')):
        parts = re.split(r'(?=^## q\d{4}\b)',path.read_text(),flags=re.M)
        for part in parts[1:]:
            sections[re.match(r'## (q\d{4})',part)[1]] = part
    migrations = []
    for cid, ids in whitelist.items():
        chapter = chapters[cid]
        chapter['questions'] = [questions[qid] for qid in ids]
        chapter['count'] = len(ids)
        chapter['contentVersion'] = VERSION
        for q in chapter['questions']:
            q['chapterId'] = cid
            if q['id'] in targets:
                target = targets[q['id']]
                old_primary = q.get('primaryKnowledgePointIds', q.get('knowledgePointIds', [])[:1])
                secondary = [k for k in q['knowledgePointIds'] if k not in old_primary and k!=target]
                q['knowledgePointIds'] = [target]+secondary
                q['primaryKnowledgePointIds'] = [target]
                migrations.append({'id':q['id'],'primaryKnowledgePointId':target})
        write(Q/'questions'/f'{cid}.json',chapter)
        text = f"# 第{int(cid[2:]):02d}章 · {chapter['title']}（{len(ids)}题）\n\n正式题库 {VERSION}。\n\n"
        for q in chapter['questions']:
            if q['id'] in REWRITTEN:
                text += render_question(q)
            else:
                section = sections[q['id']]
                section = re.sub(r'(?m)(知识点[：:])[^\n]+',lambda match:match[1]+', '.join(q['knowledgePointIds']),section)
                text += section
        (Q/'reading'/f'{cid}.md').write_text(text)
    active = [questions[qid] for ids in whitelist.values() for qid in ids]
    # Course and flashcard content stays intact. Only question references are updated here.
    kps = []
    for path in sorted((CONTENT/'courses_resource/courses').glob('ch*.json')):
        chapter = load(path)
        for kp in chapter['knowledgePoints']:
            kp['relatedQuestionIds'] = [q['id'] for q in active if kp['id'] in q['knowledgePointIds']]
            kp['primaryQuestionIds'] = [q['id'] for q in active if kp['id'] in q.get('primaryKnowledgePointIds', [])]
            kps.append(kp)
        write(path,chapter)
        course_links = {'chapterId':chapter['id'],'contentVersion':VERSION,'knowledgePointUpdates':[{key:kp[key] for key in ['id','relatedQuestionIds','primaryQuestionIds']} for kp in chapter['knowledgePoints']]}
        write(Q/'course_links'/f"{chapter['id']}.json",course_links)
    for path in sorted((CONTENT/'courses_resource/reading').glob('ch*.md')):
        text = re.sub(r'(?m)^关联题目：([^\n]*)',lambda match:'关联题目：'+'、'.join(qid for qid in re.findall(r'q\d{4}',match[1]) if qid in retained),path.read_text())
        path.write_text(text)
    for path in sorted((CONTENT/'flashcard_resource/flashcards').glob('ch*.json')):
        chapter = load(path)
        for card in chapter['cards']:
            card['relatedQuestionIds'] = [qid for qid in card['relatedQuestionIds'] if qid in retained and (qid not in REWRITTEN or targets[qid] in card['knowledgePointIds'])]
        write(path,chapter)
    links = load(CONTENT/'flashcard_resource/course_links/question_links.json')
    links['questions'] = [entry for entry in links['questions'] if entry['questionId'] in retained]
    for entry in links['questions']:
        q = questions[entry['questionId']]
        if q['id'] in REWRITTEN:
            cards = [card for path in (CONTENT/'flashcard_resource/flashcards').glob('ch*.json') for card in load(path)['cards']]
            entry['relatedFlashcardIds'] = [card['id'] for card in cards if q['id'] in card['relatedQuestionIds']]
            q['relatedFlashcardIds'] = entry['relatedFlashcardIds']
    write(CONTENT/'flashcard_resource/course_links/question_links.json',links)
    for cid in whitelist:
        write(Q/'questions'/f'{cid}.json',chapters[cid])
    coverage = {'all':len(kps),'direct':sum(bool(k['primaryQuestionIds']) for k in kps),'related':sum(bool(k['relatedQuestionIds']) for k in kps),'unlinked':[k['id'] for k in kps if not k['relatedQuestionIds']]}
    write(Q/'course_links/knowledge_point_question_index.json',{'coverage':coverage,'links':{k['id']:{key:k[key] for key in ['relatedQuestionIds','primaryQuestionIds']} for k in kps}})
    manifest = load(Q/'manifest.json')
    manifest.update(contentVersion=VERSION,auditRelease=VERSION,questionCount=200,chapterCount=20,businessTasks=28,questionTypeCounts=dict(Counter(q['type'] for q in active)),difficultyCounts=dict(Counter(q['difficulty'] for q in active)),knowledgePointCoverage=coverage,testFixtureCount=sum(len(q['testFixtures']) for q in active))
    for chapter in manifest['chapters']:
        chapter['count'] = len(whitelist[chapter['id']])
        chapter['sha256'] = sha(Q/chapter['path'])
    write(Q/'manifest.json',manifest)
    distribution = load(Q/'validation/distribution.json')
    distribution.update(chapterCounts=[len(ids) for ids in whitelist.values()],types=manifest['questionTypeCounts'],difficulties=manifest['difficultyCounts'])
    write(Q/'validation/distribution.json',distribution)
    root = load(CONTENT/'manifest.json')
    root['auditRelease'] = VERSION
    root['counts']['questions'] = 200
    root['counts']['businessTasks'] = 28
    write(CONTENT/'manifest.json',root)
    write(Q/'validation/directed-reduction.json',{'contentVersion':VERSION,'retained':whitelist,'retainedCount':200,'removedCount':100,'rewritten':sorted(REWRITTEN),'primaryMigrations':migrations,'courseMappingStatus':'等待用户提供80节知识点保留、合并及删除编号清单'})
    print('Applied exact 200-question whitelist, 100 removals, 4 rewrites, q0255 chapter migration and reference updates. Course consolidation awaits the missing fixed mapping.')

if __name__ == '__main__':
    main()
