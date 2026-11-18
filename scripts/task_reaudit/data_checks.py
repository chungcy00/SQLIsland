"""Read-only integrity and shared-fact checks for the seven frozen business databases."""

from pathlib import Path
import hashlib
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "resources/CONTENT"
OUT = ROOT / "artifacts/task-reaudit-20261118"
manifest = json.loads(
    (CONTENT / "question_resource/databases/manifest.json").read_text()
)
canonical = sqlite3.connect(
    CONTENT / "question_resource/databases/enterprise/enterprise.sqlite"
)
cache = {}


def fingerprint(db, table):
    digest = hashlib.sha256()
    count = 0
    for row in db.execute('SELECT * FROM "' + table + '" ORDER BY rowid'):
        digest.update(
            json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode()
        )
        digest.update(b"\n")
        count += 1
    return count, digest.hexdigest()


report = {"pass": True, "readOnly": True, "datasets": []}
for dataset in manifest["datasets"]:
    path = CONTENT / "question_resource" / dataset["path"]
    db = sqlite3.connect("file:" + str(path) + "?mode=ro", uri=True)
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", dataset["id"]
    assert not db.execute("PRAGMA foreign_key_check").fetchall(), dataset["id"]
    tables = [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    shared = []
    for table in tables:
        if table not in cache:
            cache[table] = fingerprint(canonical, table)
        current = fingerprint(db, table)
        assert current == cache[table], (dataset["id"], table)
        shared.append({"table": table, "rows": current[0], "factHash": current[1]})
    report["datasets"].append(
        {
            "id": dataset["id"],
            "integrity": "ok",
            "foreignKeyViolations": 0,
            "sharedFactsMatch": True,
            "tables": shared,
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    )
    db.close()
canonical.close()
(OUT / "seven-database-checks.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print("Seven databases passed integrity, foreign keys and canonical shared-fact checks")
