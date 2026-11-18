"""Refresh hashes after authorized resource edits, preserving each resource version."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1] / 'resources/CONTENT'

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

def update(value, base):
    if isinstance(value, dict):
        path = value.get('path')
        if isinstance(path, str) and (base/path).is_file():
            data = (base/path).read_bytes()
            value['sha256'] = hashlib.sha256(data).hexdigest()
            if 'bytes' in value:
                value['bytes'] = len(data)
        for child in value.values():
            update(child,base)
    elif isinstance(value,list):
        for child in value:
            update(child,base)

for path in sorted(ROOT.glob('*_resource/manifest.json')):
    manifest = json.loads(path.read_text())
    update(manifest,path.parent)
    write(path,manifest)
path = ROOT/'manifest.json'
manifest = json.loads(path.read_text())
manifest['files'] = [{'path':str(file.relative_to(ROOT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(ROOT.rglob('*')) if file.is_file() and file!=path and '__pycache__' not in file.parts]
write(path,manifest)
