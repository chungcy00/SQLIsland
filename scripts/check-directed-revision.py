"""Verify the exact whitelist, preserved question content and independent edge results."""
from pathlib import Path
import json
import runpy
import zipfile

ROOT = Path(__file__).resolve().parents[1]
module = runpy.run_path(str(ROOT/'scripts/reduce-practice-bank.py'))
whitelist = module['parse_whitelist']()
rewritten = module['REWRITTEN']
base = ROOT/'resources/CONTENT'
questions = [q for path in sorted((base/'question_resource/questions').glob('ch*.json')) for q in json.loads(path.read_text())['questions']]
assert len(questions)==len({q['id'] for q in questions})==200
assert {q['id'] for q in questions}==set(sum(whitelist.values(),[]))
for cid, ids in whitelist.items():
    assert [q['id'] for q in questions if q['chapterId']==cid]==ids
with zipfile.ZipFile(ROOT/'.tooling/before-curriculum-revision.zip') as archive:
    original = {q['id']:q for name in archive.namelist() if name.startswith('resources/CONTENT/question_resource/questions/ch') and name.endswith('.json') for q in json.loads(archive.read(name))['questions']}
allowed = {'knowledgePointIds','primaryKnowledgePointIds','prerequisiteKnowledgePointIds','relatedFlashcardIds','chapterId'}
for q in questions:
    if q['id'] not in rewritten:
        assert {key:value for key,value in original[q['id']].items() if key not in allowed}=={key:value for key,value in q.items() if key not in allowed},q['id']
kps = {kp['id'] for path in (base/'courses_resource/courses').glob('ch*.json') for kp in json.loads(path.read_text())['knowledgePoints']}
for q in questions:
    assert set(q['knowledgePointIds'])<=kps,q['id']
with zipfile.ZipFile(ROOT/'.tooling/before-curriculum-revision.zip') as archive:
    original_cards = {c['id']:c for name in archive.namelist() if name.startswith('resources/CONTENT/flashcard_resource/flashcards/ch') and name.endswith('.json') for c in json.loads(archive.read(name))['cards']}
card_links={'knowledgePointIds','primaryKnowledgePointIds','relatedKnowledgePointIds','relatedQuestionIds','businessQuestionId'}
for path in (base/'flashcard_resource/flashcards').glob('ch*.json'):
    for card in json.loads(path.read_text())['cards']:
        assert {k:v for k,v in card.items() if k not in card_links}=={k:v for k,v in original_cards[card['id']].items() if k not in card_links},card['id']
        assert set(card['knowledgePointIds'])<=kps,card['id']
        assert set(card['relatedQuestionIds'])<={q['id'] for q in questions},card['id']
expected = {
 'q0265': [[2,1,50.0]],
 'q0288': [[1,450,84.91],[2,80,15.09],[3,0,0.0]],
 'q0255': [[1,1,100,1],[1,2,100,2],[1,3,100,3],[2,1,80,1]],
 'q0290': [['2025-01',400,None,None,None],['2025-02',0,400,-400,-100.0],['2025-03',130,0,130,None]] + [[f'2025-{month:02d}',0,130 if month==4 else 0,-130 if month==4 else 0,-100.0 if month==4 else None] for month in range(4,13)],
}
for qid, rows in expected.items():
    fixture = json.loads((base/f'question_resource/fixtures/{qid}/{qid}-directed-edge.json').read_text())
    assert fixture['expected']['rows']==rows,(qid,fixture['expected']['rows'])
print('200 exact whitelist items, 100 removals, 196 unchanged contents, 4 manual edge result checks and active reference integrity passed.')
