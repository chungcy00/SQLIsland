"""Apply the supplied curriculum IDs and synchronize active references."""
from collections import defaultdict
from pathlib import Path
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'resources/CONTENT'
C = CONTENT / 'courses_resource'
Q = CONTENT / 'question_resource'
F = CONTENT / 'flashcard_resource'
VERSION = '5.0.0'
COUNTS = [3, 2, 4, 2, 2, 3, 3, 5, 3, 4, 3, 4, 2, 1, 5, 3, 2, 1]
KEEP = {f'kp{chapter:02}-{number:02}' for chapter, count in enumerate(COUNTS, 1) for number in range(1, count + 1)}
KEEP.update('kp19-' + number for number in '01 02 03 32 33 36 41 42 43 46 47 48 49 50 52 56 57 58'.split())
KEEP.update('kp20-' + number for number in '01 02 03 06 08 13 15 18 21 23'.split())

GROUPS = {
    '05-01':'01-04', '02-01':'02-03', '08-02':'08-06', '08-04':'08-06 08-07',
    '09-02':'09-04', '11-02':'11-04', '12-01':'12-05', '13-02':'13-03',
    '13-01':'13-04', '15-04':'15-06', '17-01':'17-03 17-05', '17-02':'17-04',
    '18-01':'18-02 18-03', '19-01':'19-07 19-31', '19-02':'19-14 19-37',
    '19-32':'19-08 19-20', '19-36':'19-11 19-12 19-13 20-05', '19-41':'19-15',
    '19-42':'19-16 19-18', '19-43':'19-17', '19-46':'19-19 19-22',
    '19-47':'19-30', '19-48':'19-04', '19-50':'19-21 20-04',
    '19-52':'19-05 19-24 19-51', '19-56':'19-27 19-59', '19-57':'19-06 19-28 19-29',
    '19-58':'20-10', '20-01':'19-10', '20-03':'19-09 19-23', '20-15':'20-16',
    '20-18':'20-20', '20-21':'19-54', '20-23':'19-35 20-12 20-14',
}
DELETE = set('kp'+number for number in ('14-02 19-25 19-26 19-34 19-38 19-39 19-40 19-44 19-45 19-53 19-55 19-60 20-07 20-09 20-11 20-17 20-19 20-22 20-24').split())
TARGETS = defaultdict(list)
for target, sources in GROUPS.items():
    for source in sources.split():
        TARGETS['kp'+source].append('kp'+target)

def load(path):
    return json.loads(path.read_text())

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')

def remap(ids, own=None):
    return list(dict.fromkeys(target for source in ids for target in ([source] if source in KEEP else TARGETS.get(source, [])) if target != own))

def main():
    chapter_files = {p:load(p) for p in sorted((C/'courses').glob('ch*.json'))}
    originals = {k['id']:k for chapter in chapter_files.values() for k in chapter['knowledgePoints']}
    expected = KEEP | TARGETS.keys() | DELETE
    assert len(KEEP)==80 and len(TARGETS)==53 and len(DELETE)==19 and len(expected)==152
    assert all(t in KEEP for t in ('kp'+key for key in GROUPS))
    assert set(originals)==expected or set(originals)==KEEP, (sorted(expected-originals.keys()), sorted(originals.keys()-expected))
    question_files = {p:load(p) for p in sorted((Q/'questions').glob('ch*.json'))}
    questions = {q['id']:q for chapter in question_files.values() for q in chapter['questions']}
    module = runpy.run_path(str(ROOT/'scripts/reduce-practice-bank.py'))
    whitelist = module['parse_whitelist']()
    assert len(questions)==200 and all([q['id'] for q in chapter['questions']]==whitelist[path.stem] for path,chapter in question_files.items())
    special = {f'q{number:04d}':kp for kp, numbers in module['MIGRATIONS'].items() for number in numbers}
    for q in questions.values():
        primary = [special[q['id']]] if q['id'] in special else remap(q['primaryKnowledgePointIds'])
        assert primary, q['id']
        q['primaryKnowledgePointIds'] = primary
        q['knowledgePointIds'] = list(dict.fromkeys(primary+remap(q['knowledgePointIds'])))
        if 'prerequisiteKnowledgePointIds' in q:
            q['prerequisiteKnowledgePointIds'] = remap(q['prerequisiteKnowledgePointIds'])
    card_files = {p:load(p) for p in sorted((F/'flashcards').glob('ch*.json'))}
    cards = {card['id']:card for chapter in card_files.values() for card in chapter['cards']}
    for card in cards.values():
        for key in ('primaryKnowledgePointIds','relatedKnowledgePointIds','knowledgePointIds'):
            card[key] = remap(card[key])
        card['relatedQuestionIds'] = [qid for qid in card['relatedQuestionIds'] if qid in questions]
    for q in questions.values():
        q['relatedFlashcardIds'] = [c['id'] for c in cards.values() if q['id'] in c['relatedQuestionIds']]
    for p,chapter in question_files.items():
        write(p,chapter)
        reading=Q/'reading'/f'{p.stem}.md'
        blocks=re.split(r'(?m)(?=^## q\d{4}\b)',reading.read_text())
        for index,block in enumerate(blocks[1:],1):
            q=questions[re.match(r'## (q\d{4})',block)[1]]
            ids=', '.join(q['knowledgePointIds'])
            block=re.sub(r'(?m)(知识点[：:])[^\n]+',lambda m:m[1]+ids,block)
            block=re.sub(r'(?m)( · )kp\d\d-\d\d(?:, kp\d\d-\d\d)*$',lambda m:m[1]+ids,block)
            blocks[index]=block
        reading.write_text(''.join(blocks).rstrip()+'\n')
    for p,chapter in card_files.items():
        write(p,chapter)
    links = {}
    for p,chapter in chapter_files.items():
        chapter['knowledgePoints'] = [k for k in chapter['knowledgePoints'] if k['id'] in KEEP]
        chapter['knowledgePointCount'] = len(chapter['knowledgePoints'])
        chapter['plannedQuestionCount'] = len(whitelist[p.stem])
        chapter['contentVersion'] = VERSION
        if 'advancedTaskIds' in chapter:
            chapter['advancedTaskIds'] = [k['taskId'] for k in chapter['knowledgePoints'] if k.get('taskId')]
        for k in chapter['knowledgePoints']:
            kid = k['id']
            source_ids = ['kp'+sid for sid in GROUPS.get(kid[2:], '').split()]
            if source_ids:
                k.setdefault('mergedFrom', [{'id':sid,'title':originals[sid]['title']} for sid in source_ids if sid in originals])
            for key in ('prerequisites','relatedKnowledgePointIds'):
                inherited = [ref for sid in source_ids if sid in originals for ref in originals[sid].get(key,[]) if ref not in source_ids]
                k[key] = remap(k.get(key, [])+inherited, own=kid)
            for key, data, field in [
                ('primaryQuestionIds', questions, 'primaryKnowledgePointIds'),
                ('relatedQuestionIds', questions, 'knowledgePointIds'),
                ('primaryFlashcardIds', cards, 'primaryKnowledgePointIds'),
                ('relatedFlashcardIds', cards, 'knowledgePointIds'),
            ]:
                k[key] = [item['id'] for item in data.values() if kid in item[field]]
            links[kid] = {key:k[key] for key in ('relatedQuestionIds','primaryQuestionIds')}
        write(p,chapter)
        for folder, fields in [(Q,('primaryQuestionIds','relatedQuestionIds')),(F,('primaryFlashcardIds','relatedFlashcardIds'))]:
            write(folder/'course_links'/f'{p.stem}.json', {'chapterId':p.stem,'contentVersion':VERSION,'knowledgePointUpdates':[{key:k[key] for key in ('id',*fields)} for k in chapter['knowledgePoints']]})
    coverage = {'all':80,'direct':sum(bool(x['primaryQuestionIds']) for x in links.values()),'related':sum(bool(x['relatedQuestionIds']) for x in links.values()),'unlinked':[kid for kid,x in links.items() if not x['relatedQuestionIds']]}
    write(Q/'course_links/knowledge_point_question_index.json', {'coverage':coverage,'links':links})
    write(F/'course_links/question_links.json', {'contentVersion':VERSION,'questions':[{'questionId':qid,'relatedFlashcardIds':q['relatedFlashcardIds']} for qid,q in questions.items()]})
    path=F/'reference/source_index.json'
    source=load(path)
    source['knowledgePoints']={kid:info for kid,info in source['knowledgePoints'].items() if kid in KEEP}
    source['questions']={qid:{**source['questions'].get(qid,{}),'chapterId':q['chapterId'],'knowledgePointIds':q['knowledgePointIds']} for qid,q in questions.items()}
    write(path,source)
    path=C/'curriculum-migration.json'
    write(path, {'targets':dict(TARGETS),'historyTargets':{'kp08-06':'kp08-02'},'removed':sorted(DELETE),'removedQuestions':[f'q{i:04}' for i in range(1,301) if f'q{i:04}' not in questions],'sourceTitles':{sid:originals[sid]['title'] for sid in TARGETS if sid in originals} or (load(path)['sourceTitles'] if path.exists() else {})})
    path=C/'manifest.json'
    cm=load(path)
    for entry in cm['chapters']:
        entry['knowledgePointCount']=len(chapter_files[C/entry['path']]['knowledgePoints'])
    cm.update(contentVersion=VERSION, auditRelease=VERSION)
    for key in ('knowledgePointCount','totalKnowledgePoints'):
        if key in cm: cm[key]=80
    write(path,cm)
    path=Q/'manifest.json'
    qm=load(path)
    qm['knowledgePointCoverage']=coverage
    write(path,qm)
    path=CONTENT/'manifest.json'
    manifest=load(path)
    manifest['counts']['knowledgePoints']=80
    write(path,manifest)
    path=Q/'validation/directed-reduction.json'
    report=load(path)
    report.pop('courseMappingStatus',None)
    write(path,report)
    print('80 kept, 53 merged, 19 directly removed, 200 active questions, 200 flashcards.')

if __name__=='__main__':
    main()
