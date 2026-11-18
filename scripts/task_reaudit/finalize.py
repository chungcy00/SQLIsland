"""Stamp executed evidence, preserve stable identities and record every resource delta."""

from pathlib import Path
from collections import Counter
import hashlib
import json
import tarfile
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from exports import refresh_hashes

CONTENT = ROOT / "resources/CONTENT"
OUT = ROOT / "artifacts/task-reaudit-20261118"
BASE = ROOT / ".tooling/task-reaudit-20261118"


def read(p):
    return json.loads(p.read_text())


def write(p, d):
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def stamp():
    evidence = read(OUT / "wasm-validation.json")
    chapters = {
        ch: read(CONTENT / f"question_resource/questions/ch{ch}.json")
        for ch in [19, 20]
    }
    questions = [q for chapter in chapters.values() for q in chapter["questions"]]
    semantic = [
        {
            "id": q["id"],
            "solutions": [r["mysqlSql"] for r in q["referenceSolutions"]],
            "fixtures": [
                {"path": f["path"], "sha256": f["sha256"]} for f in q["testFixtures"]
            ],
            "tolerance": q["numericTolerance"]["absolute"],
        }
        for q in questions
    ]
    assert (
        semantic == evidence["semanticInputs"]
    ), "Stale WASM query or fixture evidence"
    assert evidence["correctExecutions"] == sum(
        len(q["testFixtures"]) * len(q["referenceSolutions"]) for q in questions
    )
    assert evidence["integerPolicySha256"] == sha(
        ROOT / "src/integer-column-policy.json"
    )
    for q in questions:
        assert evidence["numericPolicies"][q["id"]].get("columnAbsolute", {}) == q[
            "numericTolerance"
        ].get("columnAbsolute", {})
    for path, value in evidence["databaseHashes"].items():
        assert sha(CONTENT / "question_resource" / path) == value
    for ch, chapter in chapters.items():
        for q in chapter["questions"]:
            q["validation"]["sqliteWasm"] = True
            q["validation"][
                "report"
            ] = "artifacts/task-reaudit-20261118/wasm-validation.json"
            path = CONTENT / f"enterprise_reference/business_tasks/{q['taskId']}.json"
            t = read(path)
            t["validationStatus"]["sqliteWasm"] = True
            write(path, t)
        write(CONTENT / f"question_resource/questions/ch{ch}.json", chapter)
    notes = """# 企业题目资源4.2.1

已依据当前七套业务数据库重新审核BP01至BP50（q0251至q0300），并重算所有公开及隐藏预期。

逐题分类、修改前后内容、独立原始事实计算及真实SQLite/WASM执行结果见仓库artifacts/task-reaudit-20261118。数据库内容版本为4.2.0，题目与关联教学资源版本为4.2.1。

原生MySQL8.4尚待运行。题目资源生成与复验入口为scripts/task_reaudit/run.py及exports.py，执行后重新生成整数列策略并构建。旧版审计报告保留其原审核时点，最新题目执行证据以本次报告为准。
"""
    (CONTENT / "TASK_REAUDIT.md").write_text(notes)
    refresh_hashes()


def resource_record():
    before = {}
    with tarfile.open(BASE / "resources-before.tar.gz") as archive:
        for member in archive:
            if (
                member.isfile()
                and member.name.startswith("CONTENT/")
                and "__pycache__" not in member.name
            ):
                content = archive.extractfile(member).read()
                before[member.name[len("CONTENT/") :]] = {
                    "bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                }
        original_q = []
        original_cards = []
        original_points = []
        for ch in range(1, 21):
            for group, field, target in [
                ("question_resource/questions", "questions", original_q),
                ("flashcard_resource/flashcards", "cards", original_cards),
                ("courses_resource/courses", "knowledgePoints", original_points),
            ]:
                target.extend(
                    json.load(archive.extractfile(f"CONTENT/{group}/ch{ch:02}.json"))[
                        field
                    ]
                )
    after = {
        str(p.relative_to(CONTENT)): {"bytes": p.stat().st_size, "sha256": sha(p)}
        for p in CONTENT.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts
    }
    changes = [
        {"path": path, "before": before.get(path), "after": after.get(path)}
        for path in sorted(set(before) | set(after))
        if before.get(path) != after.get(path)
    ]
    current_q = []
    current_cards = []
    current_points = []
    for ch in range(1, 21):
        for group, field, target in [
            ("question_resource/questions", "questions", current_q),
            ("flashcard_resource/flashcards", "cards", current_cards),
            ("courses_resource/courses", "knowledgePoints", current_points),
        ]:
            target.extend(read(CONTENT / f"{group}/ch{ch:02}.json")[field])
    for old, new, number in [
        (original_q, current_q, 300),
        (original_cards, current_cards, 200),
        (original_points, current_points, 152),
    ]:
        assert len(old) == len(new) == number
        assert [r["id"] for r in old] == [r["id"] for r in new]
    old = {q["id"]: q for q in original_q}
    for q in current_q:
        assert q.get("knowledgePointIds") == old[q["id"]].get("knowledgePointIds"), q[
            "id"
        ]
    for ch in range(1, 19):
        assert (
            before[f"question_resource/questions/ch{ch:02}.json"]
            == after[f"question_resource/questions/ch{ch:02}.json"]
        )
    projects = Counter(q["projectId"] for q in current_q if q.get("taskId"))
    assert projects == {
        "retail": 5,
        "inventory": 5,
        "ecommerce": 5,
        "finance": 5,
        "hr": 5,
        "procurement": 5,
        "enterprise": 20,
    }
    assert not any(change["path"].endswith(".sqlite") for change in changes)
    write(
        OUT / "resource-sync.json",
        {
            "contentVersion": "4.2.1",
            "stableQuestions": 300,
            "stableCards": 200,
            "stableKnowledgePoints": 152,
            "knowledgePointAssociationsPreserved": True,
            "projects": dict(projects),
            "unaffectedQuestionChapters": list(range(1, 19)),
            "changedResourceCount": len(changes),
            "resources": changes,
        },
    )
    current = read(CONTENT / "manifest.json")
    for entry in current["files"]:
        path = CONTENT / entry["path"]
        assert (
            sha(path) == entry["sha256"] and path.stat().st_size == entry["bytes"]
        ), entry["path"]
    write(
        OUT / "manifest-validation.json",
        {
            "pass": True,
            "files": len(current["files"]),
            "contentVersion": current["auditRelease"],
        },
    )


if __name__ == "__main__":
    stamp()
    resource_record()
