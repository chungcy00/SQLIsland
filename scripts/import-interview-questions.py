#!/usr/bin/env python3
"""把「面试刷题 98 题」源文件转换成应用的题目与夹具格式（幂等）。

用法：python3 scripts/import-interview-questions.py [源 JSON 路径]
输出：resources/CONTENT/interview_resource/questions.json 与 fixtures/iNNN/*.json
源文件只读，不修改。
"""
import glob
import hashlib
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = sys.argv[1] if len(sys.argv) > 1 else "/Users/caiying/Downloads/98题新/题库_前98道_增强修订版.json"
OUT = os.path.join(ROOT, "resources/CONTENT/interview_resource")

source = json.load(open(SOURCE, encoding="utf-8"))
problems = source["problems"]
assert len(problems) == 98, len(problems)

# 课文知识点 id，只保留应用里真实存在的
known = {}
for path in sorted(glob.glob(os.path.join(ROOT, "resources/CONTENT/courses_resource/courses/ch*.json"))):
    chapter = json.load(open(path, encoding="utf-8"))
    for kp in chapter["knowledgePoints"]:
        known[kp["id"]] = kp["title"]


def lesson_ids(mapping):
    ids = []
    primary = (mapping.get("primary_lesson") or {}).get("id")
    if primary:
        ids.append(primary)
    for item in mapping.get("related_lessons") or []:
        ids.append(item["id"])
    ids += mapping.get("related_knowledge_point_ids") or []
    out = []
    for i in ids:
        if i in known and i not in out:
            out.append(i)
    return primary if primary in known else None, out


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


shutil.rmtree(os.path.join(OUT, "fixtures"), ignore_errors=True)
questions = []
for p in problems:
    qid = p["id"].replace("island-", "")  # i001
    state_mode = p["judge"].get("mode") == "table_state"
    ordered = bool(p["judge"].get("order_sensitive"))
    primary, related = lesson_ids(p.get("course_mapping", {}))
    ref = p["reference"]

    # 夹具：公开 = 题目示例；隐藏 = 其余测试（与示例相同的不重复）
    def setup(case):
        return case["schema_sql"].strip() + "\n" + case["seed_sql"].strip()

    cases = [("public", "public", p["example"], p["example"]["expected"])]
    seen = {setup(p["example"])}
    for case in p["test_cases"]:
        key = setup(case)
        if key in seen:
            continue
        seen.add(key)
        cases.append(("hidden", case["id"], case, case["expected"]))

    fixtures = []
    for visibility, variant, case, expected in cases:
        fid = f"{qid}-{'public' if visibility == 'public' else variant}"
        fixture = {
            "id": fid,
            "questionId": qid,
            "datasetId": f"{qid}-interview",
            "visibility": visibility,
            "variant": variant,
            "kind": "database_state" if state_mode else "query",
            "setupSql": setup(case),
        }
        if state_mode:
            fixture["probes"] = []
            fixture["expectedTable"] = {
                "name": p["judge"]["target_table"],
                "columns": expected["columns"],
                "rows": expected["rows"],
            }
        else:
            fixture["expected"] = {"columns": expected["columns"], "rows": expected["rows"]}
        rel = f"fixtures/{qid}/{fid}.json"
        write_json(os.path.join(OUT, rel), fixture)
        fixtures.append({
            "id": fid,
            "visibility": visibility,
            "variant": variant,
            "path": rel,
            "sha256": sha(os.path.join(OUT, rel)),
        })

    columns = p["example"]["expected"]["columns"]
    if state_mode:
        requirements = p["task"] + "\n判题方式：在独立的数据库副本中执行你的语句，再比较表中全部数据；不会改动其他题目的数据。"
        expected_output = {"kind": "database_state", "table": p["judge"]["target_table"]}
        order_policy, column_policy = "not_applicable", "database_state"
    else:
        order_text = (
            "按题目要求排序，判断时同时比较行的先后顺序。"
            if ordered
            else "不要求排序；判断时比较各行及其重复次数，不比较行的先后顺序。"
        )
        requirements = f"{p['task']}\n输出字段名称及顺序：{', '.join(columns)}\n结果排序要求：{order_text}"
        expected_output = {
            "kind": "query",
            "columns": columns,
            "rows": p["example"]["expected"]["rows"],
            "rowCount": len(p["example"]["expected"]["rows"]),
        }
        order_policy, column_policy = ("ordered" if ordered else "unordered_multiset"), "exact_names_in_order"

    reference = {k: v for k, v in ref.items() if k in ("platform", "number", "title", "url")}
    questions.append({
        "id": qid,
        "chapterId": "interview",
        "sourceId": p["id"],
        "knowledgePointIds": related,
        "primaryKnowledgePointIds": [primary] if primary else [],
        "difficulty": p["difficulty"],
        "type": "独立编写",
        "topic": p["topic"],
        "reference": reference,
        "title": p["title"],
        "context": p["context"],
        "task": p["task"],
        "columnDocs": p.get("columns", []),
        "orderSensitive": ordered,
        "requirements": requirements,
        "datasetId": f"{qid}-interview",
        "schemaVersion": 3,
        "contentVersion": "1.0.0",
        "sourceTables": [],
        "initialCode": "",
        "options": [],
        "acceptedBlanks": [],
        "expectedOutput": expected_output,
        "referenceSolutions": [{"kind": "reference", "mysqlSql": p["solution"], "sqliteSql": p["solution"]}],
        "hints": p["hints"],
        "explanation": p["explanation"],
        "commonErrors": [],
        "testFixtureIds": [f["id"] for f in fixtures],
        "testFixtures": fixtures,
        "orderPolicy": order_policy,
        "columnPolicy": column_policy,
        "numericTolerance": {"absolute": 1e-06, "integerExact": True, "textExact": True, "nullDistinct": True},
        "requiredAstFeatures": [],
        "supportStatus": "直接兼容",
        "compatibility": p.get("compatibility_note", "SQLite 离线执行已验证"),
        "executionMode": "database_state" if state_mode else "query_result",
        "runAllowedBeforeSubmit": True,
        "hiddenFixturePolicy": "用户代码独立执行公开与隐藏夹具",
        "validationStatus": "SQLite 参考答案已在全部夹具上通过；未做原生 MySQL 或手机验收",
        "mysqlVerification": "未运行 MySQL 8.4",
    })

write_json(os.path.join(OUT, "questions.json"), {
    "count": len(questions),
    "schemaVersion": 3,
    "contentVersion": "1.0.0",
    "title": "面试刷题",
    "questions": questions,
})
print(f"wrote {len(questions)} questions, {sum(len(q['testFixtures']) for q in questions)} fixtures")
