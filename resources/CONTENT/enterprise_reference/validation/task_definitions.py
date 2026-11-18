"""Load the current audited task definitions for the enterprise generator."""
import json
from pathlib import Path

_task_directory = Path(__file__).resolve().parents[1] / 'business_tasks'
T = []
for _number in range(1, 51):
    _task = json.loads((_task_directory / f'BP{_number:02}.json').read_text())
    T.append({key: _task[key] for key in [
        'projectId', 'title', 'context', 'requirements', 'grain',
        'commonError', 'executionSteps', 'difficulty',
    ]})
    T[-1]['sql'] = _task['sqliteSql']
