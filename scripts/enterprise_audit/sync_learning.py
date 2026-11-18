"""Synchronize all 50 tasks, lessons, references, fixtures and linked cards."""

import copy
import json
import re
import time
from pathlib import Path
from repair_data import CONTENT, ORIGINAL, DBREL, OUT, connect, dump
from sync_resources import query, sha, VERSION
from independent import Model
from mini_scenarios import scenario


def equivalent(sql):
    other = re.sub(
        r"([\w.]+) BETWEEN ('[^']+'|\d+) AND ('[^']+'|\d+)", r"(\1>=\2 AND \1<=\3)", sql
    )
    if other == sql:
        other = sql.replace("COALESCE(", "IFNULL(")
    if other == sql:
        other = sql.replace("<>", "!=")
    if other == sql:
        other = re.sub(r"(\w+)=0", r"\1 IN (0)", sql)
    if other == sql:
        other = sql.replace("freq>=3", "freq>2").replace("n>=3", "n>2")
    if other == sql and "SUM(CASE WHEN" in sql:
        other = sql.replace("SUM(CASE WHEN", "COUNT(CASE WHEN").replace(
            "THEN 1 ELSE 0 END)", "THEN 1 ELSE NULL END)"
        )
    if other == sql and "COUNT(*)" in sql:
        # Remaining tasks aggregate nonempty groups, so SUM(1) has the same result.
        other = sql.replace("COUNT(*)", "SUM(1)")
    if other == sql:
        other = re.sub(r"ABS\(([^()]+)\)>100", r"(\1 < -100 OR \1 > 100)", sql)
    assert other != sql, "An equivalent reference must use a distinct expression"
    return other


def matches(a, b, tolerance=1e-6):
    return len(a) == len(b) and all(
        len(x) == len(y)
        and all(
            (u == v)
            or (
                isinstance(u, (int, float))
                and isinstance(v, (int, float))
                and abs(u - v) <= tolerance
            )
            for u, v in zip(x, y)
        )
        for x, y in zip(a, b)
    )


def retarget(n, patch, rows):
    """Legacy adversarial cases follow actual candidates instead of stale fixed IDs."""
    if not rows:
        return patch
    row = rows[0]
    if n in (6, 8, 10, 31, 35):
        w, p = row[:2]
        patch = [re.sub(r"warehouse_id=\d+", f"warehouse_id={w}", sql) for sql in patch]
        patch = [re.sub(r"product_id=\d+", f"product_id={p}", sql) for sql in patch]
    if n == 3:
        patch = [
            re.sub(r"product_id=\d+", f"product_id={row[0]}", sql) for sql in patch
        ]
    if n == 15:
        patch = [
            re.sub(r"customer_id=\d+", f"customer_id={row[0]}", sql) for sql in patch
        ]
    if n == 23:
        patch = [
            re.sub(r"employee_id=\d+", f"employee_id={row[0]}", sql) for sql in patch
        ]
    if n == 28:
        patch = [
            re.sub(r"po_item_id=\d+", f"po_item_id={row[0]}", sql) for sql in patch
        ]
    if n == 33:
        p, w = row[:2]
        patch = [re.sub(r"warehouse_id=\d+", f"warehouse_id={w}", sql) for sql in patch]
        patch = [re.sub(r"product_id=\d+", f"product_id={p}", sql) for sql in patch]
    if n == 37:
        patch = [
            re.sub(r"supplier_id=\d+", f"supplier_id={row[0]}", sql) for sql in patch
        ]
    if n == 42:
        patch = [
            re.sub(r"\),\d+,'2025-12-31'", f"),{row[0]},'2025-12-31'", sql)
            for sql in patch
        ]
    return patch


def main():
    canonical = connect(CONTENT / DBREL)
    base_model = Model(canonical)
    minis = []
    for seed in [202611171, 202611179]:
        db, fixture = scenario(canonical, seed)
        path = (
            CONTENT / f"question_resource/fixtures/shared/enterprise-mini-{seed}.json"
        )
        dump(path, fixture)
        minis.append((db, fixture, Model(db), path))
    task_report = []
    sync = []
    qfiles = {
        ch: json.loads(
            (ORIGINAL / f"question_resource/questions/ch{ch}.json").read_text()
        )
        for ch in [19, 20]
    }
    tasks = {}
    for n in range(1, 51):
        tid = f"BP{n:02}"
        t = json.loads(
            (CONTENT / f"enterprise_reference/business_tasks/{tid}.json").read_text()
        )
        tasks[tid] = t
        q = next(
            q
            for chapter in qfiles.values()
            for q in chapter["questions"]
            if q["taskId"] == tid
        )
        expected = query(canonical, t["sqliteSql"])
        oracle = base_model.result(n)
        tolerance = 0.0100001 if n == 29 else 1e-6
        if not matches(oracle, expected["rows"], tolerance):
            raise AssertionError(
                (
                    "Independent base mismatch",
                    tid,
                    next(
                        (
                            (a, b)
                            for a, b in zip(oracle, expected["rows"])
                            if not matches([a], [b], tolerance)
                        ),
                        None,
                    ),
                )
            )
        t["referenceSolutions"] = [
            {
                "kind": "reference",
                "mysqlSql": t["mysqlSql"],
                "sqliteSql": t["sqliteSql"],
            },
            {
                "kind": "algebraic equivalent",
                "mysqlSql": equivalent(t["mysqlSql"]),
                "sqliteSql": equivalent(t["sqliteSql"]),
            },
        ]
        suffix = q["requirements"].split("\n输出字段", 1)
        q.update(
            {
                key: t[key]
                for key in [
                    "mysqlSql",
                    "sqliteSql",
                    "referenceSolutions",
                    "expectedRowCount",
                    "expectedColumns",
                    "columns",
                    "explanation",
                ]
            }
        )
        q["requirements"] = t["requirements"] + (
            "\n输出字段" + suffix[1] if len(suffix) > 1 else ""
        )
        q["expectedOutput"] = {
            "kind": "query",
            **expected,
            "rowCount": len(expected["rows"]),
        }
        q["numericTolerance"]["absolute"] = tolerance
        q["contentVersion"] = VERSION
        q["explanation"] = (
            " → ".join(t["executionSteps"])
            + "。"
            + t["commonError"]
            + "\n"
            + t["requirements"]
            + "\n已在主库、边界夹具和两套独立企业场景中与原始事实表的独立Python计算交叉核对。"
        )
        original_fixtures = copy.deepcopy(q["testFixtures"])
        q["testFixtures"] = []
        tests = []
        for entry in original_fixtures:
            f = json.loads((ORIGINAL / "question_resource" / entry["path"]).read_text())
            f["baseSha256"] = sha(CONTENT / "question_resource" / f["baseDatabase"])
            f["patchSql"] = retarget(n, f.get("patchSql", []), expected["rows"])
            f["patchDescription"] = (
                "审计主库公开基准"
                if f["visibility"] == "public"
                else "隔离诊断边界数据，允许故意制造来源对账差异；"
                + f["patchDescription"]
            )
            db = connect(CONTENT / "question_resource" / f["baseDatabase"])
            for sql in f["patchSql"]:
                db.execute(sql)
            actual = query(db, t["sqliteSql"])
            model = Model(db)
            independent = model.result(n)
            if not matches(independent, actual["rows"], tolerance):
                raise AssertionError(
                    (
                        "Independent boundary mismatch",
                        tid,
                        entry["id"],
                        next(
                            (
                                (a, b)
                                for a, b in zip(independent, actual["rows"])
                                if not matches([a], [b], tolerance)
                            ),
                            None,
                        ),
                    )
                )
            f["expected"] = {"columns": actual["columns"], "rows": independent}
            f["numericTolerance"] = q["numericTolerance"]
            f["contentVersion"] = VERSION
            dump(CONTENT / "question_resource" / entry["path"], f)
            entry["sha256"] = sha(CONTENT / "question_resource" / entry["path"])
            q["testFixtures"].append(entry)
            equivalent_result = query(db, t["referenceSolutions"][1]["sqliteSql"])
            assert matches(actual["rows"], equivalent_result["rows"], tolerance)
            tests.append(
                {
                    "fixture": entry["id"],
                    "rows": len(actual["rows"]),
                    "independent": True,
                    "equivalent": True,
                    "changedFromPublic": not matches(
                        actual["rows"], expected["rows"], tolerance
                    ),
                }
            )
            db.close()
        extra_cases = []
        if n in (7, 34):
            extra_cases.append(
                (
                    "missing-snapshot",
                    [
                        "DELETE FROM inventory_snapshots WHERE snapshot_id=(SELECT MIN(snapshot_id) FROM inventory_snapshots WHERE snapshot_date='2024-12-31')"
                    ],
                    "缺少一份期初快照，无法计算的平均库存和周转指标保留NULL。",
                )
            )
        if n == 17:
            extra_cases.append(
                (
                    "full-credit",
                    [
                        "INSERT INTO supplier_credit_notes(credit_note_id,supplier_invoice_id,credit_date,amount_cents,reason) SELECT (SELECT MAX(credit_note_id)+1 FROM supplier_credit_notes),supplier_invoice_id,'2025-12-31',balance_cents,'全额抵销边界' FROM v_invoice_balance WHERE paid_cents=0 AND balance_cents>0 ORDER BY supplier_invoice_id LIMIT 1"
                    ],
                    "无付现、净应付被批准贷项全额抵销，应标记已结清。",
                )
            )
        if n == 10 and expected["rows"]:
            warehouse, product = expected["rows"][0][:2]
            contract = canonical.execute(
                "SELECT * FROM supplier_contracts WHERE product_id=? AND start_date<='2025-12-31' AND end_date>='2025-12-31' ORDER BY contract_id LIMIT 1",
                (product,),
            ).fetchone()
            extra_cases.append(
                (
                    "distant-inbound",
                    [
                        f"INSERT INTO purchase_orders(po_id,supplier_id,warehouse_id,order_date,promised_date,status) SELECT MAX(po_id)+1,{contract['supplier_id']},{warehouse},'2025-12-31','2026-03-01','placed' FROM purchase_orders",
                        f"INSERT INTO purchase_order_items(po_item_id,po_id,product_id,contract_id,quantity_ordered,unit_price_cents) SELECT MAX(po_item_id)+1,(SELECT MAX(po_id) FROM purchase_orders),{product},{contract['contract_id']},1000000,{contract['unit_price_cents']} FROM purchase_order_items",
                    ],
                    "承诺三月到货的巨大在途量不能抵扣一月30日内的补货缺口。",
                )
            )
        for variant, patches, description in extra_cases:
            entry = copy.deepcopy(original_fixtures[1])
            entry["id"] = q["id"] + "-" + variant
            entry["path"] = f"fixtures/{q['id']}/{entry['id']}.json"
            entry["variant"] = variant
            f = json.loads(
                (
                    ORIGINAL / "question_resource" / original_fixtures[0]["path"]
                ).read_text()
            )
            f.update(
                id=entry["id"],
                visibility="hidden",
                variant=variant,
                patchSql=patches,
                patchDescription="隔离边界场景：" + description,
                baseSha256=sha(CONTENT / "question_resource" / f["baseDatabase"]),
            )
            boundary = connect(CONTENT / "question_resource" / f["baseDatabase"])
            for patch in patches:
                boundary.execute(patch)
            output = query(boundary, t["sqliteSql"])
            oracle = Model(boundary).result(n)
            assert matches(oracle, output["rows"], tolerance), (tid, variant)
            extra_equivalent = query(boundary, t["referenceSolutions"][1]["sqliteSql"])
            assert matches(extra_equivalent["rows"], oracle, tolerance)
            f["expected"] = {"columns": output["columns"], "rows": oracle}
            f["contentVersion"] = VERSION
            f["numericTolerance"] = q["numericTolerance"]
            dump(CONTENT / "question_resource" / entry["path"], f)
            entry["sha256"] = sha(CONTENT / "question_resource" / entry["path"])
            q["testFixtures"].append(entry)
            tests.append(
                {
                    "fixture": entry["id"],
                    "rows": len(oracle),
                    "independent": True,
                    "equivalent": True,
                    "changedFromPublic": not matches(
                        oracle, expected["rows"], tolerance
                    ),
                }
            )
            boundary.close()
        for db, template, model, path in minis:
            iid = q["id"] + "-mini-" + str(template["scenarioSeed"])
            oracle = model.result(n)
            actual = query(db, t["sqliteSql"])
            eq = query(db, t["referenceSolutions"][1]["sqliteSql"])
            if not matches(oracle, actual["rows"], tolerance):
                raise AssertionError(
                    (
                        "Independent mini mismatch",
                        tid,
                        template["scenarioSeed"],
                        len(oracle),
                        len(actual["rows"]),
                        next(
                            (
                                (a, b)
                                for a, b in zip(oracle, actual["rows"])
                                if not matches([a], [b], tolerance)
                            ),
                            None,
                        ),
                    )
                )
            assert matches(eq["rows"], oracle, tolerance)
            relative = f'fixtures/{q["id"]}/{iid}.json'
            f = {
                "id": iid,
                "questionId": q["id"],
                "visibility": "hidden",
                "variant": "independent-enterprise",
                "kind": "query",
                "sharedDataPath": str(path.relative_to(CONTENT / "question_resource")),
                "sharedDataSha256": sha(path),
                "expected": {"columns": actual["columns"], "rows": oracle},
                "orderPolicy": q["orderPolicy"],
                "numericTolerance": q["numericTolerance"],
                "columnPolicy": q["columnPolicy"],
                "contentVersion": VERSION,
            }
            dump(CONTENT / "question_resource" / relative, f)
            q["testFixtures"].append(
                {
                    "id": iid,
                    "visibility": "hidden",
                    "variant": "independent-enterprise",
                    "path": relative,
                    "sha256": sha(CONTENT / "question_resource" / relative),
                }
            )
            tests.append(
                {
                    "fixture": iid,
                    "rows": len(oracle),
                    "independent": True,
                    "equivalent": True,
                    "changedFromPublic": not matches(
                        oracle, expected["rows"], tolerance
                    ),
                }
            )
        assert any(test["changedFromPublic"] for test in tests[1:]), tid
        q["testFixtureIds"] = [f["id"] for f in q["testFixtures"]]
        q["hiddenFixturePolicy"] = (
            "提交时在独立副本执行边界及两套独立企业场景，公开试运行仅使用公开夹具。"
        )
        q["validation"] = {
            "kind": "business-audit",
            "contentVersion": VERSION,
            "fixtures": tests,
            "independentMethod": "Python原始事实表聚合，未读取任务SQL/预存结果/派生视图",
            "mysqlNative": "未执行",
        }
        t["testFixtureIds"] = q["testFixtureIds"]
        dump(CONTENT / f"enterprise_reference/business_tasks/{tid}.json", t)
        task_report.append(
            {
                "task": tid,
                "question": q["id"],
                "title": t["title"],
                "difficulty": q["difficulty"],
                "rows": len(expected["rows"]),
                "elapsedMs": t["elapsedMs"],
                "independent": True,
                "fixtures": tests,
            }
        )
        sync.append(
            {
                "task": tid,
                "question": q["id"],
                "fixtures": len(tests),
                "updated": [
                    "requirements",
                    "references",
                    "explanation",
                    "publicExpected",
                    "hiddenExpected",
                    "hashes",
                ],
            }
        )
    for ch, chapter in qfiles.items():
        chapter["contentVersion"] = VERSION
        dump(CONTENT / f"question_resource/questions/ch{ch}.json", chapter)
    # Preview rows are regenerated from actual repaired tables, while teaching micro-examples keep their own data.
    affected_cards = []
    affected_kps = []
    for ch in range(1, 21):
        path = CONTENT / f"courses_resource/courses/ch{ch:02}.json"
        chapter = json.loads((ORIGINAL / path.relative_to(CONTENT)).read_text())
        changed = False
        for kp in chapter["knowledgePoints"]:
            if kp.get("taskId") not in tasks:
                continue
            t = tasks[kp["taskId"]]
            result = json.loads(
                (
                    CONTENT
                    / f"enterprise_reference/business_tasks/results/{t['id']}.json"
                ).read_text()
            )
            kp.update(
                mysqlSql=t["mysqlSql"],
                sqliteSql=t["sqliteSql"],
                syntax=t["mysqlSql"],
                concept=t["requirements"],
                notes=f"完整输出见 ../enterprise_reference/business_tasks/results/{t['id']}.json；公开预览展示前12行。独立边界及场景仅在提交判题时使用。",
            )
            kp["result"].update(
                columns=result["columns"],
                rows=result["rows"][:12],
                totalRows=len(result["rows"]),
            )
            for table in kp["sourceTables"]:
                cur = canonical.execute("SELECT * FROM " + table["name"] + " LIMIT 3")
                table["rows"] = [list(r) for r in cur]
                table["columns"] = [
                    {
                        "name": d[0],
                        "type": (
                            "派生"
                            if table["name"].startswith("v_")
                            else next(
                                x[2]
                                for x in canonical.execute(
                                    "PRAGMA table_info(" + table["name"] + ")"
                                )
                                if x[1] == d[0]
                            )
                        ),
                    }
                    for d in cur.description
                ]
            affected_kps.append(kp["id"])
            changed = True
        if changed:
            chapter["contentVersion"] = VERSION
            dump(path, chapter)
        path = CONTENT / f"flashcard_resource/flashcards/ch{ch:02}.json"
        chapter = json.loads((ORIGINAL / path.relative_to(CONTENT)).read_text())
        changed = False
        for card in chapter["cards"]:
            tid = card.get("businessTaskId")
            if tid in tasks:
                card["contentVersion"] = VERSION
                card["businessResource"][
                    "note"
                ] = "关联审计版企业资源4.2.0；本卡使用独立微型教学数据，不能当作企业主库结果。"
                if tid == "BP09":
                    card["back"][
                        "explanation"
                    ] += "\n企业仓库库龄中调入为本仓新批次，销售、调出及损耗均按FIFO消耗。"
                additions = {
                    "BP04": "线下促销日使用EXISTS标记是否存在适用线下的活动，重叠只计一天；线上专属活动不计入。实际优惠仍须满足门店、品类、会员与门槛。",
                    "BP07": "期初或期末快照缺失时，平均库存保持未知，不能把缺失当作零。",
                    "BP10": "30日缺口只抵扣承诺未来30日内的在途；更远日期与逾期量均不能自动视为按期可用。",
                    "BP17": "正式企业库先扣除批准贷项再算净应付，零余额表示已结清，包括无须付现的全额抵销。",
                    "BP22": "先纳入上一年末的历史月份，再筛选输出年度；本卡三个独立月份用于说明加权分母。",
                    "BP29": "在同一非空行集上AVG金额/AVG数量与SUM金额/SUM数量等价，但AVG单价通常不是加权均价。",
                    "BP34": "缺失任一必要快照时平均库存及回报倍数保持NULL。",
                    "BP40": "先引入跨年的历史月份再筛选输出年度；只有可用历史确实不足三个月时才返回NULL。",
                    "BP45": "观察区间为首购日第0—89日；截止2025-12-31，10月3日首购已经成熟，10月4日尚未成熟。",
                }
                if tid in additions:
                    card["back"]["explanation"] += "\n" + additions[tid]
                if tid == "BP40":
                    card["front"]["question"] = card["front"]["question"].replace(
                        "前两月不足三个月不展示比例", "可用历史不足三个月时不展示比例"
                    )
                if tid == "BP24":
                    card["businessResource"]["analysisPeriod"] = "2025年第四季度"
                affected_cards.append(card["id"])
                changed = True
        if changed:
            chapter["contentVersion"] = VERSION
            dump(path, chapter)
    dump(OUT / "task-audit.json", task_report)
    dump(
        OUT / "resource-sync.json",
        {
            "version": VERSION,
            "questions": sync,
            "knowledgePoints": affected_kps,
            "flashcards": affected_cards,
        },
    )
    canonical.close()
    print(
        "Synchronized 50 questions,",
        len(affected_kps),
        "knowledge points,",
        len(affected_cards),
        "linked cards and independently verified business fixtures",
        flush=True,
    )


if __name__ == "__main__":
    main()
