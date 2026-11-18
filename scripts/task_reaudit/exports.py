"""Synchronize reviewable exports and hash inventories from the current formal JSON."""

from pathlib import Path
from collections import defaultdict
import json
import re
import hashlib

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "resources/CONTENT"
VERSION = "4.2.1"


def read(p):
    return json.loads(p.read_text())


def write(p, d):
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def table(columns, rows):
    escape = (
        lambda v: ("NULL" if v is None else str(v))
        .replace("|", "\\|")
        .replace("\n", " ")
    )
    return "\n".join(
        [
            "| " + " | ".join(columns) + " |",
            "| " + " | ".join(["---"] * len(columns)) + " |",
        ]
        + ["| " + " | ".join(map(escape, row)) + " |" for row in rows]
    )


def sql(code):
    return "```sql\n" + code.strip().rstrip(";") + ";\n```"


def exports():
    tasks = {
        f"BP{n:02}": read(
            CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
        )
        for n in range(1, 51)
    }
    groups = defaultdict(list)
    for tid, t in tasks.items():
        groups[t["projectId"]].append(t)
        qid = f"q{250+int(tid[2:]):04}"
        references = "\n\n".join(sql(r["mysqlSql"]) for r in t["referenceSolutions"])
        (CONTENT / f"question_resource/validation/mysql_business/{tid}.sql").write_text(
            "-- "
            + t["title"]
            + "\n-- 题目资源4.2.1，原生MySQL8.4尚未验证\n\n"
            + "\n\n".join(
                r["mysqlSql"].rstrip(";") + ";" for r in t["referenceSolutions"]
            )
            + "\n"
        )
    for group, records in groups.items():
        lines = [
            "# " + group + " 企业实战",
            "",
            f"题目资源 {VERSION}，数据库 4.2.0。",
            "",
        ]
        for t in records:
            lines.extend(
                [
                    "## " + t["id"] + " " + t["title"],
                    "",
                    t["requirements"],
                    "",
                    "输出列为 " + ", ".join(t["columns"]) + "。",
                    "",
                    sql(t["mysqlSql"]),
                    "",
                    f"最新公开结果共 {t['expectedRowCount']} 行，完整结果见 results/{t['id']}.json。",
                    "",
                    t["explanation"],
                    "",
                ]
            )
        (CONTENT / f"enterprise_reference/business_tasks/{group}.md").write_text(
            "\n".join(lines)
        )
    for ch in [19, 20]:
        chapter = read(CONTENT / f"question_resource/questions/ch{ch}.json")
        lines = [
            f"# 第{ch}章企业实战题",
            "",
            f"题目资源 {VERSION}。答案及完整结果用于开发复核，隐藏场景由提交判题使用。",
            "",
        ]
        for q in chapter["questions"]:
            lines.extend(
                [
                    "## " + q["id"] + " " + q["title"],
                    "",
                    f"{q['difficulty']} · {q['datasetId']} · "
                    + ", ".join(q["knowledgePointIds"]),
                    "",
                    q["requirements"],
                    "",
                    "### 提示",
                    "",
                ]
            )
            lines.extend(f"{i+1}. {hint}" for i, hint in enumerate(q["hints"]))
            lines.extend(
                [
                    "",
                    "### 参考解",
                    "",
                    sql(q["mysqlSql"]),
                    "",
                    "### 等价解",
                    "",
                    sql(q["referenceSolutions"][1]["mysqlSql"]),
                    "",
                    "### 解析",
                    "",
                    q["explanation"],
                    "",
                    f"公开结果 {q['expectedRowCount']} 行，完整结果位于 ../../enterprise_reference/business_tasks/results/{q['taskId']}.json。",
                    "",
                ]
            )
        (CONTENT / f"question_resource/reading/ch{ch}.md").write_text("\n".join(lines))
        chapter = read(CONTENT / f"courses_resource/courses/ch{ch}.json")
        path = CONTENT / f"courses_resource/reading/ch{ch}.md"
        text = path.read_text()
        for kp in chapter["knowledgePoints"]:
            if kp.get("taskId") not in tasks:
                continue
            lines = [
                "## " + kp["id"] + " " + kp["title"],
                "",
                "### 业务要求",
                "",
                kp["concept"],
                "",
                "### 参考查询",
                "",
                sql(kp["mysqlSql"]),
                "",
                "### 执行思路",
                "",
            ]
            lines.extend(
                f"{i+1}. {step}" for i, step in enumerate(kp["executionSteps"])
            )
            lines.extend(
                [
                    "",
                    "### 易错点",
                    "",
                    kp["commonError"]["example"],
                    "",
                    "### 结果预览",
                    "",
                    table(kp["result"]["columns"], kp["result"]["rows"]),
                    "",
                    f"完整结果共 {kp['result']['totalRows']} 行，见 {kp['result']['fullResultPath']}。",
                    "",
                ]
            )
            pattern = r"^## " + re.escape(kp["id"]) + r"\b.*?(?=^## |\Z)"
            text, count = re.subn(
                pattern, lambda match: "\n".join(lines) + "\n", text, flags=re.M | re.S
            )
            assert count == 1, kp["id"]
        path.write_text(text.rstrip() + "\n")
        chapter = read(CONTENT / f"flashcard_resource/flashcards/ch{ch}.json")
        path = CONTENT / f"flashcard_resource/reading/ch{ch}.md"
        text = path.read_text()
        for card in chapter["cards"]:
            if not card.get("businessTaskId"):
                continue
            lines = [
                "## " + card["id"] + " " + card["type"] + " · " + card["difficulty"],
                "",
                "知识点 " + ", ".join(card["knowledgePointIds"]),
                "",
                "### 正面",
                "",
                card["front"]["question"],
                "",
                card["front"].get("dataNote", ""),
            ]
            if card["front"].get("code"):
                lines += ["", sql(card["front"]["code"])]
            for preview in card["front"].get("sourceTables", []):
                lines += [
                    "",
                    "#### " + preview["name"],
                    "",
                    table([c["name"] for c in preview["columns"]], preview["rows"]),
                ]
            lines += [
                "",
                "### 背面",
                "",
                card["back"]["answer"],
                "",
                card["back"]["explanation"],
            ]
            if card["back"].get("code"):
                lines += ["", sql(card["back"]["code"])]
            for key in ["result", "wrongResult"]:
                result = card["back"].get(key)
                if result and "rows" in result:
                    lines += [
                        "",
                        "#### " + ("正确结果" if key == "result" else "错误写法结果"),
                        "",
                        table(result["columns"], result["rows"]),
                    ]
            lines += ["", card["businessResource"]["note"], ""]
            pattern = r"^## " + re.escape(card["id"]) + r"\b.*?(?=^## |\Z)"
            text, count = re.subn(
                pattern, lambda match: "\n".join(lines) + "\n", text, flags=re.M | re.S
            )
            assert count == 1, card["id"]
        path.write_text(text.rstrip() + "\n")
    generator = CONTENT / "enterprise_reference/validation/task_definitions.py"
    generator.write_text(
        '''"""Load the current audited task definitions for the enterprise generator."""
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
'''
    )
    for p in CONTENT.rglob("CURRICULUM.md"):
        s = p.read_text().replace(
            "补货优先级与供应商风险", "补货优先级与商品历史履约风险"
        )
        p.write_text(s)
    for relative in [
        "AUDIT_REPORT.md",
        "enterprise_reference/validation/REPORT.md",
        "question_resource/validation/REPORT.md",
    ]:
        path = CONTENT / relative
        marker = "> 本文件保留历史审核时点；最新50题复审为题目资源4.2.1，入口见CONTENT/TASK_REAUDIT.md及artifacts/task-reaudit-20261118。\n\n"
        original = path.read_text()
        if not original.startswith(marker):
            path.write_text(marker + original)
    return tasks


def refresh_hashes():
    tasks = {
        f"BP{n:02}": read(
            CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
        )
        for n in range(1, 51)
    }
    root = CONTENT / "enterprise_reference/business_tasks"
    write(
        root / "manifest.json",
        {
            "contentVersion": VERSION,
            "count": 50,
            "tasks": [
                {
                    "id": tid,
                    "path": tid + ".json",
                    "title": t["title"],
                    "projectId": t["projectId"],
                    "datasetId": t["datasetId"],
                    "questionId": f"q{250+int(tid[2:]):04}",
                    "sha256": sha(root / (tid + ".json")),
                    "expectedRows": t["expectedRowCount"],
                }
                for tid, t in tasks.items()
            ],
        },
    )

    def update_paths(obj, base):
        if isinstance(obj, dict):
            if "path" in obj:
                p = base / obj["path"]
                if p.is_file():
                    if "sha256" in obj:
                        obj["sha256"] = sha(p)
                    if "bytes" in obj:
                        obj["bytes"] = p.stat().st_size
            for v in obj.values():
                update_paths(v, base)
        elif isinstance(obj, list):
            for v in obj:
                update_paths(v, base)

    path = CONTENT / "flashcard_resource/reference/source_index.json"
    index = read(path)
    for field in ["sourceFiles", "auditedSourceFiles"]:
        index[field] = {
            str(p.relative_to(CONTENT)): sha(p)
            for group in ["courses_resource/courses", "question_resource/questions"]
            for p in sorted((CONTENT / group).glob("*.json"))
        }
    index.update(courseVersion=VERSION, questionVersion=VERSION)
    for tid, entry in index["businessTasks"].items():
        entry["sourceSha256"] = sha(root / (tid + ".json"))
        if "title" in entry:
            entry["title"] = tasks[tid]["title"]
    write(path, index)
    path = CONTENT / "enterprise_reference/manifest_root.json"
    m = read(path)
    m["contentVersion"] = VERSION
    m["taskSummary"] = [
        {
            "id": tid,
            "questionId": f"q{250+int(tid[2:]):04}",
            "rows": t["expectedRowCount"],
        }
        for tid, t in tasks.items()
    ]
    update_paths(m, CONTENT)
    write(path, m)
    for group in ["courses_resource", "question_resource", "flashcard_resource"]:
        path = CONTENT / group / "manifest.json"
        m = read(path)
        m.update(contentVersion=VERSION, auditRelease=VERSION)
        if group == "question_resource":
            m["testFixtureCount"] = sum(
                len(q.get("testFixtures", []))
                for p in (CONTENT / group / "questions").glob("*.json")
                for q in read(p)["questions"]
            )
        update_paths(m, CONTENT / group)
        write(path, m)
    path = CONTENT / "manifest.json"
    m = read(path)
    m["auditRelease"] = VERSION
    m["files"] = [
        {
            "path": str(p.relative_to(CONTENT)),
            "bytes": p.stat().st_size,
            "sha256": sha(p),
        }
        for p in sorted(CONTENT.rglob("*"))
        if p.is_file() and p != path and "__pycache__" not in p.parts
    ]
    write(path, m)


if __name__ == "__main__":
    exports()
    refresh_hashes()
