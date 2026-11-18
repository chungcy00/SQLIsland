"""Preserve integer output types from typed fixture JSON before JS number parsing."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
resources = root / 'resources/CONTENT/question_resource'
policy = {}
for file in sorted((resources / 'questions').glob('ch*.json')):
    for question in json.loads(file.read_text())['questions']:
        values = {}
        hashes = {}
        for entry in question.get('testFixtures', []):
            raw = (resources / entry['path']).read_bytes()
            hashes[entry['path']] = hashlib.sha256(raw).hexdigest()
            expected = json.loads(raw).get('expected', {})
            if not isinstance(expected, dict):
                continue
            for index, column in enumerate(expected.get('columns', [])):
                samples = values.setdefault(column, [])
                samples.extend(row[index] for row in expected.get('rows', [])
                               if row[index] is not None)
        columns = [column for column, samples in values.items()
                   if samples and all(type(value) is int for value in samples)]
        if columns:
            policy[question['id']] = {'exactColumns': columns, 'fixtureHashes': hashes}
output = root / 'src/integer-column-policy.json'
output.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + '\n')
print(f'Integer policies for {len(policy)} questions')
