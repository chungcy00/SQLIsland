"""Convert the existing prediction questions in place and refresh resource hashes."""
from pathlib import Path
import collections
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'resources/CONTENT'
BANK = CONTENT / 'question_resource'
VERSION = '4.2.2'

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def refresh():
    questions = [q for p in sorted((BANK / 'questions').glob('ch*.json')) for q in json.loads(p.read_text())['questions']]
    manifest = json.loads((BANK / 'manifest.json').read_text())
    manifest.update(contentVersion=VERSION, auditRelease=VERSION, questionTypeCounts=dict(collections.Counter(q['type'] for q in questions)))
    def update(value):
        if isinstance(value, dict):
            if isinstance(value.get('path'), str) and (BANK / value['path']).is_file():
                path = BANK / value['path']
                value['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
                if 'bytes' in value:
                    value['bytes'] = path.stat().st_size
            for child in list(value.values()):
                update(child)
        elif isinstance(value, list):
            for child in value:
                update(child)
    update(manifest)
    dump(BANK / 'manifest.json', manifest)
    root = json.loads((CONTENT / 'manifest.json').read_text())
    root['auditRelease'] = VERSION
    root['files'] = [dict(path=str(p.relative_to(CONTENT)), bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(CONTENT.rglob('*')) if p.is_file() and p != CONTENT / 'manifest.json' and '__pycache__' not in p.parts]
    dump(CONTENT / 'manifest.json', root)

if __name__ == '__main__':
    current = json.loads((BANK / 'manifest.json').read_text())
    if current['questionCount'] != 300:
        raise SystemExit('This historical conversion requires the 300-question source bank.')
    backup = ROOT / '.tooling/prediction-conversion-before.zip'
    if not backup.exists():
        with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as archive:
            for folder in ['questions', 'reading', 'reference', 'validation']:
                for path in (BANK / folder).glob('*'):
                    if path.is_file():
                        archive.write(path, str(path.relative_to(ROOT)))
            for path in [CONTENT / 'manifest.json', BANK / 'manifest.json', BANK / 'README.md']:
                archive.write(path, str(path.relative_to(ROOT)))
    converted = []
    for path in sorted((BANK / 'questions').glob('ch*.json')):
        chapter = json.loads(path.read_text())
        reading = BANK / 'reading' / (path.stem + '.md')
        text = reading.read_text()
        changed = False
        for q in chapter['questions']:
            if q['type'] != '结果预测':
                continue
            old = dict(q)
            q.update(type='独立编写', previousExecutionMode='predict_public_result', executionMode='query_result', contentVersion=VERSION, initialCode='', runAllowedBeforeSubmit=True)
            q['requirements'] = '编写 SQL，完成以下查询要求。\n' + '\n'.join(old['requirements'].splitlines()[1:])
            q['hiddenFixturePolicy'] = '公开与隐藏场景均通过实际执行判题，核对完整列、行、NULL、重复记录、顺序及精度。'
            q['hints'] = old['hints'][:2] + ['按题设编写投影、筛选及分组，使用运行检查列名、NULL、重复记录和排序。']
            pattern = r'(## ' + q['id'] + r' · .*?)(?=\n---\n|\Z)'
            def revise(match):
                block = match[0].replace('题型：结果预测', '题型：独立编写').replace(old['requirements'], q['requirements'])
                block = block.replace('初始代码：\n```sql\n' + old['initialCode'] + '\n```\n\n', '')
                if len(old['hints']) > 2:
                    block = block.replace('3. ' + old['hints'][2], '3. ' + q['hints'][2])
                return block
            text, count = re.subn(pattern, revise, text, flags=re.S)
            assert count == 1, q['id']
            converted.append(q['id'])
            changed = True
        if changed:
            chapter['contentVersion'] = VERSION
            dump(path, chapter)
            reading.write_text(text)
    distribution = BANK / 'validation/distribution.json'
    value = json.loads(distribution.read_text())
    value['types'].pop('结果预测', None)
    value['types']['独立编写'] = 145
    dump(distribution, value)
    readme = BANK / 'README.md'
    text = readme.read_text().replace('；结果预测只比较公开预期', '')
    if '## 4.2.2 题型调整' not in text:
        text += '\n## 4.2.2 题型调整\n\n原25道结果预测题沿用编号，改为独立编写题。当前题型为选择30、代码填空35、独立编写145、代码纠错30、业务情景60。公开、边界及空表夹具均用于SQL执行判题。复验记录见 validation/prediction-conversion.json。\n'
    readme.write_text(text)
    spec = BANK / 'reference/QUESTION_BANK.md'
    text = spec.read_text().replace('独立编写120、代码纠错30、结果预测25', '独立编写145、代码纠错30').replace('## 六题型', '## 五题型')
    text = '\n'.join(line for line in text.split('\n') if not line.startswith('- 预测：'))
    spec.write_text(text)
    refresh()
    print('Converted', len(converted), converted)
