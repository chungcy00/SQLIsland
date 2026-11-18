"""Reaudit latest resources, preserving frozen business facts and all stable IDs."""

from pathlib import Path
import collections
import copy
import hashlib
import json
import re
import sqlite3
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/enterprise_audit"))
from independent import Model
from sync_learning import equivalent, matches
from validate import fixture_db, wrong_solutions, hardcode, business_checks
from sync_resources import query
from changes import CHANGES

CONTENT = ROOT / "resources/CONTENT"
OUT = ROOT / "artifacts/task-reaudit-20261118"
SNAPSHOT = ROOT / ".tooling/task-reaudit-20261118"
VERSION = "4.2.1"


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def connect(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.create_function(
        "CONCAT",
        -1,
        lambda *args: (
            "".join(str(x) for x in args) if all(x is not None for x in args) else None
        ),
    )
    return db


def rows_match(actual, expected, question, columns):
    if len(actual) != len(expected):
        return False
    for left, right in zip(actual, expected):
        if len(left) != len(right):
            return False
        for column, a, b in zip(columns, left, right):
            allowed = (
                question["numericTolerance"]
                .get("columnAbsolute", {})
                .get(column, question["numericTolerance"]["absolute"])
            )
            if a == b:
                continue
            if a is None or b is None:
                return False
            if (
                not isinstance(a, (int, float))
                or not isinstance(b, (int, float))
                or abs(a - b) > allowed
            ):
                return False
    return True


def altered_task(before, n):
    t = copy.deepcopy(before)
    change = CHANGES.get(n, {})
    for key in ["title", "requirements"]:
        if key in change:
            t[key] = change[key]
    if change.get("append"):
        t["requirements"] += " " + change["append"]
    if "sql" in change:
        t["sqliteSql"] = change["sql"]
    if n == 14:
        t["sqliteSql"] = t["sqliteSql"].replace(
            "s.sessions,COALESCE", "COALESCE(s.sessions,0) sessions,COALESCE"
        )
        t["sqliteSql"] = t["sqliteSql"].replace(
            "WHERE o.order_date BETWEEN '2025-01-01' AND '2025-12-31'",
            "WHERE t.session_date BETWEEN '2025-01-01' AND '2025-12-31' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31'",
        )
    if n == 45:
        t["sqliteSql"] = t["sqliteSql"].replace(
            "JOIN marketing_campaigns p", "LEFT JOIN marketing_campaigns p"
        )
    if "sql" in change or n in (14, 45):
        t["mysqlSql"] = t["sqliteSql"]
    if "steps" in change:
        t["executionSteps"] = change["steps"]
    if "error" in change:
        t["commonError"] = change["error"]
    if n == 20:
        t["grain"] = "发票"
    t["referenceSolutions"] = [
        {"kind": "reference", "mysqlSql": t["mysqlSql"], "sqliteSql": t["sqliteSql"]},
        {
            "kind": "equivalent",
            "mysqlSql": equivalent(t["mysqlSql"]),
            "sqliteSql": equivalent(t["sqliteSql"]),
        },
    ]
    t["contentVersion"] = VERSION
    return t


def extra_fixtures(n, q, t, db):
    cases = []
    if n == 14:
        row = db.execute(
            "SELECT s.session_id FROM customer_sessions s JOIN orders o ON o.session_id=s.session_id WHERE o.channel='online' AND o.status='completed' AND o.order_date BETWEEN '2025-01-01' AND '2025-01-10' ORDER BY o.order_date,o.order_id LIMIT 1"
        ).fetchone()
        cases.append(
            (
                "cross-year-session",
                [
                    f"UPDATE customer_sessions SET session_date='2024-12-31' WHERE session_id={row[0]}"
                ],
                "跨年访问会话的订单不应进入当年访问总体的转化分子",
            )
        )
        sid = db.execute("SELECT MAX(source_id)+1 FROM traffic_sources").fetchone()[0]
        cases.append(
            (
                "no-sessions",
                [f"INSERT INTO traffic_sources VALUES({sid},'零访问边界渠道')"],
                "零访问渠道计数为0，未知预算为NULL",
            )
        )
    if n == 19:
        bid = db.execute(
            "SELECT bank_id FROM bank_transactions WHERE reference_no IS NULL LIMIT 1"
        ).fetchone()[0]
        other = db.execute(
            "SELECT bank_id FROM bank_transactions WHERE reference_no IS NOT NULL LIMIT 1"
        ).fetchone()[0]
        cases.append(
            (
                "reference-collision",
                [
                    f"UPDATE bank_transactions SET reference_no='BANK-{bid}' WHERE bank_id={other}"
                ],
                "真实参考号与无参考号显示名相同，仍为两种独立键",
            )
        )
    if n in (20, 28, 42):
        source = db.execute(
            "SELECT f.supplier_invoice_id,f.po_id,f.invoice_no,f.invoice_date,f.due_date FROM supplier_invoices f WHERE f.invoice_date BETWEEN '2025-01-01' AND '2025-11-30' AND EXISTS(SELECT 1 FROM supplier_invoice_items x WHERE x.supplier_invoice_id=f.supplier_invoice_id AND x.quantity_billed>=2) ORDER BY f.supplier_invoice_id LIMIT 1"
        ).fetchone()
        iid = db.execute(
            "SELECT MAX(supplier_invoice_id)+1 FROM supplier_invoices"
        ).fetchone()[0]
        patches = [
            f"INSERT INTO supplier_invoices VALUES({iid},{source['po_id']},'REVIEW-SPLIT-{iid}','{source['invoice_date']}','{source['due_date']}')",
            f"INSERT INTO supplier_invoice_items(supplier_invoice_id,po_item_id,quantity_billed,unit_price_cents) SELECT {iid},po_item_id,CAST(quantity_billed/2 AS INTEGER),unit_price_cents FROM supplier_invoice_items WHERE supplier_invoice_id={source['supplier_invoice_id']} AND quantity_billed>=2",
            f"UPDATE supplier_invoice_items SET quantity_billed=quantity_billed-CAST(quantity_billed/2 AS INTEGER) WHERE supplier_invoice_id={source['supplier_invoice_id']} AND quantity_billed>=2",
        ]
        cases.append(
            (
                "split-invoice",
                patches,
                "分批开票保持原总量，收货价值不得被多张发票重复使用",
            )
        )
    if n == 28:
        p = db.execute(
            "SELECT po_item_id,po_id,unit_price_cents FROM v_po_lines WHERE order_date>='2025-01-01' ORDER BY po_item_id LIMIT 1"
        ).fetchone()
        iid = db.execute(
            "SELECT MAX(supplier_invoice_id)+1 FROM supplier_invoices"
        ).fetchone()[0]
        cases.append(
            (
                "future-invoice",
                [
                    f"INSERT INTO supplier_invoices VALUES({iid},{p['po_id']},'REVIEW-FUTURE','2026-01-03','2026-02-03')",
                    f"INSERT INTO supplier_invoice_items(supplier_invoice_id,po_item_id,quantity_billed,unit_price_cents) VALUES({iid},{p['po_item_id']},7,{p['unit_price_cents']})",
                ],
                "截止日之后开票不计入期末三方核对",
            )
        )
    if n == 37:
        p = db.execute(
            "SELECT warehouse_id,product_id FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31' AND quantity_ordered>accepted LIMIT 1"
        ).fetchone()
        cases.append(
            (
                "missing-risk-snapshot",
                [
                    f"DELETE FROM inventory_snapshots WHERE warehouse_id={p[0]} AND product_id={p[1]} AND snapshot_date='2025-12-31'"
                ],
                "缺失快照仍保留供应商逾期采购金额，库存暴露未知",
            )
        )
    if n == 45:
        row = db.execute(t["sqliteSql"]).fetchone()
        cases.append(
            (
                "missing-ad-budget",
                [
                    f"DELETE FROM marketing_campaigns WHERE source_id={row[0]} AND month_key='{row[1]}'"
                ],
                "有成熟新客但预算记录缺失，保留同期群并返回NULL获客成本",
            )
        )
    if n == 50:
        sid = db.execute(
            "SELECT snapshot_id FROM inventory_snapshots WHERE snapshot_date='2025-03-31' LIMIT 1"
        ).fetchone()[0]
        cases.append(
            (
                "missing-quarter-stock",
                [f"DELETE FROM inventory_snapshots WHERE snapshot_id={sid}"],
                "季度末任一快照缺失使库存未知，并增加缺失指标数",
            )
        )
        cases.append(
            (
                "interim-snapshot",
                [
                    "INSERT INTO inventory_snapshots(warehouse_id,product_id,snapshot_date,quantity,unit_cost_cents) SELECT i.warehouse_id,i.product_id,'2025-12-15',o.quantity+COALESCE((SELECT SUM(m.quantity_delta) FROM stock_movements m WHERE m.warehouse_id=i.warehouse_id AND m.product_id=i.product_id AND m.movement_date<='2025-12-15'),0),i.unit_cost_cents FROM inventory_snapshots i JOIN inventory_opening o ON o.warehouse_id=i.warehouse_id AND o.product_id=i.product_id WHERE i.snapshot_date='2025-12-31' ORDER BY i.snapshot_id LIMIT 1"
                ],
                "真实流水重构月内库存快照，不得计入季度末库存",
            )
        )
    sales_tasks = {
        1,
        2,
        3,
        4,
        5,
        11,
        12,
        13,
        14,
        15,
        32,
        34,
        38,
        39,
        40,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
    }
    if n in sales_tasks:
        patches = []
        original = read(CONTENT / "question_resource" / q["testFixtures"][0]["path"])
        source = connect(CONTENT / "question_resource" / original["baseDatabase"])
        has_movements = (
            source.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE name='stock_movements'"
            ).fetchone()[0]
            > 0
        )
        source.close()
        maximum = db.execute("SELECT MAX(return_id) FROM returns").fetchone()[0]
        for offset, (channel, period) in enumerate(
            [
                ("store", "2025-10-01"),
                ("online", "2025-10-01"),
                ("online", "2025-01-01"),
            ],
            1,
        ):
            row = db.execute(
                "SELECT r.* FROM returns r JOIN order_items i USING(order_item_id) JOIN orders o USING(order_id) WHERE o.channel=? AND o.order_date>=? AND o.order_date<='2025-12-31' AND r.quantity>=2 AND (i.quantity*i.unit_price_cents-i.discount_cents)%i.quantity=0 ORDER BY o.order_date,r.return_id LIMIT 1",
                (channel, period),
            ).fetchone()
            if not row:
                continue
            rid = row["return_id"]
            new_id = maximum + offset
            unit_refund = row["refund_cents"] // row["quantity"]
            patches += [
                f"INSERT INTO returns VALUES({new_id},{row['order_item_id']},'{row['return_date']}',{row['quantity']-1},{row['refund_cents']-unit_refund})",
                f"UPDATE returns SET quantity=1,refund_cents={unit_refund} WHERE return_id={rid}",
            ]
            if has_movements:
                patches += [
                    f"INSERT INTO stock_movements(warehouse_id,product_id,movement_date,movement_type,quantity_delta,unit_cost_cents,order_item_id,return_id) SELECT warehouse_id,product_id,movement_date,'return',quantity_delta-1,unit_cost_cents,order_item_id,{new_id} FROM stock_movements WHERE return_id={rid}",
                    f"UPDATE stock_movements SET quantity_delta=1 WHERE return_id={rid}",
                ]
        cases.append(
            (
                "multiple-partial-returns",
                patches,
                "同一原销售行拆成多次部分退货，累计数量金额与原业务一致，库存流水同步拆分",
            )
        )
    template = read(CONTENT / "question_resource" / q["testFixtures"][0]["path"])
    result = []
    for variant, patches, note in cases:
        fid = q["id"] + "-review-" + variant
        relative = f"fixtures/{q['id']}/{fid}.json"
        f = copy.deepcopy(template)
        f.update(
            id=fid,
            visibility="hidden",
            variant=variant,
            patchSql=patches,
            patchDescription=note,
        )
        entry = {
            "id": fid,
            "visibility": "hidden",
            "variant": variant,
            "path": relative,
        }
        result.append((entry, f))
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = read(CONTENT / "question_resource/databases/manifest.json")
    db_hashes = {
        d["id"]: digest(CONTENT / "question_resource" / d["path"])
        for d in manifest["datasets"]
    }
    canonical = connect(
        CONTENT / "question_resource/databases/enterprise/enterprise.sqlite"
    )
    oracle = Model(canonical)
    qfiles = {
        ch: read(CONTENT / f"question_resource/questions/ch{ch}.json")
        for ch in [19, 20]
    }
    questions = {
        q["taskId"]: q for chapter in qfiles.values() for q in chapter["questions"]
    }
    snapshot = SNAPSHOT / "tasks-before.json"
    if not snapshot.exists():
        write(
            snapshot,
            {
                f"BP{n:02}": read(
                    CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
                )
                for n in range(1, 51)
            },
        )
    baseline = read(snapshot)
    report = []
    tasks = {}
    all_wrong = []
    for n in range(1, 51):
        tid = f"BP{n:02}"
        before = baseline[tid]
        q = questions[tid]
        t = altered_task(before, n)
        start = time.perf_counter()
        actual = query(canonical, t["sqliteSql"])
        elapsed = (time.perf_counter() - start) * 1000
        if n == 29:
            q["numericTolerance"]["absolute"] = 1e-6
            q["numericTolerance"]["columnAbsolute"] = {
                "weighted_price_cents": 0.0100001,
                "low_price_cents": 0.0100001,
            }
        independent = oracle.result(n)
        tolerance = max(
            [
                q["numericTolerance"]["absolute"],
                *q["numericTolerance"].get("columnAbsolute", {}).values(),
            ]
        )
        assert rows_match(independent, actual["rows"], q, actual["columns"]), (
            tid,
            "public independent",
            len(independent),
            len(actual["rows"]),
        )
        columns = actual["columns"]
        output = {"columns": columns, "rows": independent}
        before_output = query(canonical, before["sqliteSql"])
        t.update(
            columns=columns,
            expectedColumns=columns,
            expectedRowCount=len(independent),
            elapsedMs=round(elapsed, 3),
        )
        t["numericTolerance"] = copy.deepcopy(q["numericTolerance"])
        t["explanation"] = "。".join(t["executionSteps"]) + "。" + t["commonError"]
        t["validationStatus"] = {
            "independentPython": True,
            "sqliteNative": True,
            "sqliteWasm": False,
            "mysql84Native": False,
        }
        q.update(
            {
                key: t[key]
                for key in [
                    "title",
                    "grain",
                    "commonError",
                    "executionSteps",
                    "mysqlSql",
                    "sqliteSql",
                    "referenceSolutions",
                    "columns",
                    "expectedColumns",
                    "expectedRowCount",
                    "explanation",
                ]
            }
        )
        order = re.search(r"ORDER BY ([^\n]+)$", t["sqliteSql"], re.I).group(1)
        q["requirements"] = (
            t["requirements"]
            + "\n输出字段名称及顺序："
            + ", ".join(columns)
            + "。输出顺序（含决胜键）："
            + order
            + "。金额单位为马币分；派生金额及比率按题设保留小数，零分母为NULL。"
        )
        q["expectedOutput"] = {"kind": "query", **output, "rowCount": len(independent)}
        q["contentVersion"] = VERSION
        q["hints"] = [
            t["executionSteps"][0],
            "；".join(t["executionSteps"][1:3]),
            t["commonError"],
        ]
        t["hints"] = copy.deepcopy(q["hints"])
        candidates = []
        for entry in q["testFixtures"]:
            if "-review-" not in entry["id"]:
                candidates.append(
                    (
                        copy.deepcopy(entry),
                        read(CONTENT / "question_resource" / entry["path"]),
                    )
                )
        candidates.extend(extra_fixtures(n, q, t, canonical))
        fixtures = []
        checks = []
        for entry, f in candidates:
            db = fixture_db(f)
            try:
                current = query(db, t["sqliteSql"])
                expected = Model(db).result(n)
                assert rows_match(expected, current["rows"], q, columns), (
                    tid,
                    entry["id"],
                    "independent",
                    len(expected),
                    len(current["rows"]),
                    expected[:2],
                    current["rows"][:2],
                )
                eq = query(db, t["referenceSolutions"][1]["sqliteSql"])
                assert eq["columns"] == columns and rows_match(
                    expected, eq["rows"], q, columns
                ), (tid, entry["id"], "equivalent")
                f["expected"] = {"columns": columns, "rows": expected}
                f["contentVersion"] = VERSION
                f["numericTolerance"] = q["numericTolerance"]
                write(CONTENT / "question_resource" / entry["path"], f)
                entry["sha256"] = digest(CONTENT / "question_resource" / entry["path"])
                fixtures.append(entry)
                checks.append(
                    {
                        "id": entry["id"],
                        "visibility": entry["visibility"],
                        "rows": len(expected),
                        "independent": True,
                        "correct": True,
                        "equivalent": True,
                    }
                )
            finally:
                db.close()
        q["testFixtures"] = fixtures
        q["testFixtureIds"] = [e["id"] for e in fixtures]
        q["validation"] = {
            "kind": "latest-business-task-reaudit",
            "contentVersion": VERSION,
            "fixtures": checks,
            "independentMethod": "原始事实表Python逐记录计算，不读取参考SQL、视图或预存预期结果",
            "mysqlNative": "未执行",
        }
        t["testFixtureIds"] = q["testFixtureIds"]
        task_path = CONTENT / f"enterprise_reference/business_tasks/{tid}.json"
        write(task_path, t)
        write(
            CONTENT / f"enterprise_reference/business_tasks/results/{tid}.json", output
        )
        for dialect in ["sqlite", "mysql"]:
            (
                CONTENT
                / f"enterprise_reference/business_tasks/{dialect}_queries/{tid}.sql"
            ).write_text(t[dialect + "Sql"].rstrip(";") + ";\n")
        source_tables = sorted(
            set(
                name
                for name, in canonical.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
                )
                if re.search(r"\b" + re.escape(name) + r"\b", t["sqliteSql"], re.I)
            )
        )
        q["sourceTables"] = source_tables
        t["sourceTables"] = source_tables
        dependencies = set(source_tables)
        pending = list(source_tables)
        schemas = dict(
            canonical.execute(
                "SELECT name,sql FROM sqlite_master WHERE type IN ('table','view')"
            )
        )
        while pending:
            name = pending.pop()
            for dependency in schemas:
                if dependency not in dependencies and re.search(
                    r"\b" + re.escape(dependency) + r"\b", schemas[name] or "", re.I
                ):
                    dependencies.add(dependency)
                    pending.append(dependency)
        q["dependencyTables"] = t["dependencyTables"] = sorted(dependencies)
        write(task_path, t)
        extra_wrong = []
        if n == 1:
            raw = """WITH raw_sales AS (
              SELECT o.store_id,o.channel,o.order_date,
                i.quantity*i.unit_price_cents-i.discount_cents-COALESCE(r.refund_cents,0) net_cents,
                (i.quantity-COALESCE(r.quantity,0))*i.unit_cost_cents cost_cents
              FROM orders o JOIN order_items i ON i.order_id=o.order_id
              LEFT JOIN returns r ON r.order_item_id=i.order_item_id AND r.return_date<='2025-12-31'
              WHERE o.status='completed'
            ), """ + t[
                "sqliteSql"
            ][
                5:
            ].replace(
                "v_sales_lines", "raw_sales"
            )
            extra_wrong.append(("退货明细未经聚合导致重复销售", raw))
        wrong = []
        for label, sql in (
            extra_wrong
            + wrong_solutions(q)
            + [
                ("硬编码最新公开结果", hardcode(output)),
                ("上一版答案", before["sqliteSql"]),
            ]
        ):
            if sql == t["sqliteSql"]:
                continue
            attempts = []
            rejected = False
            for entry in fixtures:
                f = read(CONTENT / "question_resource" / entry["path"])
                db = fixture_db(f)
                try:
                    value = query(db, sql)
                    passed = value["columns"] == columns and rows_match(
                        value["rows"], f["expected"]["rows"], q, columns
                    )
                    attempts.append(
                        {
                            "fixture": entry["id"],
                            "executed": True,
                            "accepted": passed,
                            "rows": len(value["rows"]),
                        }
                    )
                    if not passed:
                        rejected = True
                        break
                except sqlite3.Error as error:
                    attempts.append(
                        {"fixture": entry["id"], "executed": False, "error": str(error)}
                    )
                    break
                finally:
                    db.close()
            wrong.append(
                {
                    "label": label,
                    "sql": sql,
                    "rejectedByResult": rejected,
                    "attempts": attempts,
                }
            )
        assert any(
            w["rejectedByResult"] and w["attempts"][-1].get("executed") for w in wrong
        ), (tid, "No executable wrong query rejected")
        all_wrong.append({"task": tid, "question": q["id"], "queries": wrong})
        proven = [
            w
            for w in wrong
            if w["rejectedByResult"]
            and w["label"] not in ["硬编码最新公开结果", "上一版答案"]
        ]
        q["commonErrors"] = [{"reason": t["commonError"]}] + [
            {
                "sql": w["sql"],
                "reason": w["label"],
                "validation": "最新公开及隐藏夹具实际执行拒绝",
                "counterexample": w["attempts"][-1]["fixture"],
            }
            for w in proven[:3]
        ]
        task_record = {
            "task": tid,
            "question": q["id"],
            "originalTitle": before["title"],
            "title": t["title"],
            "category": CHANGES.get(n, {}).get("category", "A"),
            "issue": CHANGES.get(n, {}).get(
                "issue",
                "最新结构、业务口径、主库及现有独立场景复核通过；重新计算预期结果。",
            ),
            "before": {
                "requirements": before["requirements"],
                "sql": before["sqliteSql"],
                "columns": before_output["columns"],
                "rowCount": len(before_output["rows"]),
            },
            "after": {
                "requirements": t["requirements"],
                "sql": t["sqliteSql"],
                "columns": columns,
                "rowCount": len(independent),
            },
            "difficulty": q["difficulty"],
            "knowledgePointIds": q["knowledgePointIds"],
            "sourceTables": source_tables,
            "publicExecutionMs": round(elapsed, 3),
            "checks": checks,
            "wrongRejected": sum(w["rejectedByResult"] for w in wrong),
            "beforeDistribution": distribution(before_output),
            "afterDistribution": distribution(output),
        }
        report.append(task_record)
        tasks[tid] = t
        print(
            tid,
            task_record["category"],
            len(independent),
            "rows",
            len(fixtures),
            "fixtures",
            flush=True,
        )
    for ch, data in qfiles.items():
        data["contentVersion"] = VERSION
        write(CONTENT / f"question_resource/questions/ch{ch}.json", data)
    synchronize_learning(tasks, canonical)
    for d in manifest["datasets"]:
        assert (
            digest(CONTENT / "question_resource" / d["path"]) == db_hashes[d["id"]]
        ), d["id"]
    write(
        OUT / "database-hashes.json",
        {"databaseContentUnchanged": True, "sha256": db_hashes},
    )
    write(OUT / "tasks.json", report)
    write(OUT / "wrong-solutions.json", all_wrong)
    checks = business_checks(canonical)
    write(OUT / "business-invariants.json", checks)
    assert all(item["pass"] for item in checks), checks
    canonical.close()


def distribution(output):
    result = {"rows": len(output["rows"])}
    for name in ["flags", "risk_count", "missing_count", "issue"]:
        if name in output["columns"]:
            i = output["columns"].index(name)
            result[name] = dict(
                collections.Counter(str(row[i]) for row in output["rows"])
            )
    return result


def synchronize_learning(tasks, db):
    for ch in [19, 20]:
        path = CONTENT / f"courses_resource/courses/ch{ch}.json"
        chapter = read(path)
        for kp in chapter["knowledgePoints"]:
            if kp.get("taskId") not in tasks:
                continue
            t = tasks[kp["taskId"]]
            full = read(
                CONTENT / f"enterprise_reference/business_tasks/results/{t['id']}.json"
            )
            kp.update(
                title=t["title"],
                learningObjective="在统一企业数据库中独立完成：" + t["title"],
                concept=t["requirements"],
                syntax=t["mysqlSql"],
                mysqlSql=t["mysqlSql"],
                sqliteSql=t["sqliteSql"],
                executionSteps=t["executionSteps"],
                useCase=t["context"],
            )
            kp["commonError"] = {
                "example": t["commonError"],
                "correction": "依据输出粒度及截止日分别聚合，再核对完整结果。",
            }
            kp["result"].update(
                columns=full["columns"],
                rows=full["rows"][:12],
                totalRows=len(full["rows"]),
            )
            kp["visualization"]["resultColumns"] = full["columns"]
            kp["visualization"]["steps"] = [
                {"id": str(i + 1), "label": label}
                for i, label in enumerate(t["executionSteps"])
            ]
            kp["sourceTables"] = []
            for name in t["sourceTables"]:
                cur = db.execute('SELECT * FROM "' + name + '" LIMIT 3')
                fields = db.execute('PRAGMA table_info("' + name + '")').fetchall()
                kp["sourceTables"].append(
                    {
                        "name": name,
                        "columns": [
                            {"name": r["name"], "type": r["type"] or "派生"}
                            for r in fields
                        ],
                        "rows": [list(r) for r in cur],
                        "previewOnly": True,
                    }
                )
            kp["contentVersion"] = VERSION
        chapter["contentVersion"] = VERSION
        write(path, chapter)
        path = CONTENT / f"flashcard_resource/flashcards/ch{ch}.json"
        chapter = read(path)
        additions = {
            5: "企业任务使用全体汇总后的加权指标作为基准，分别比较毛利率下降1个百分点、达成率低于基准80%及退款率高于基准125%；不能简单平均比率。",
            10: "履约率汇总同仓同商品的全部供应商采购行，按行等权，不表示某一家供应商评分。",
            14: "转化分子和分母必须属于同一期间访问会话总体，跨年访问不能仅凭下单日期进入当年转化分子。",
            19: "银行净支出使用有符号金额的负和，正向冲回不能逐行取绝对值。无参考号使用类型和编号复合键，防止与真实参考号碰撞。",
            20: "价格差异按本张发票数量乘采购行单价核对；部分发票不能与整张采购单收货额比较，批准贷项也不应当作开票单价错误。",
            28: "完整企业题按发票日期筛选截止日已开票记录，不能把未来开票带入期末核对。本微例只说明明细预聚合。",
            29: "完整企业题只有两列派生价格允许0.0100001分误差，溢价百分比仍按0.000001个百分点核对，编号精确。",
            37: "缺少某个关联商品仓的期末快照时，保留全部逾期采购金额，总库存暴露金额返回NULL。",
            42: "企业题按采购行和发票先后分配合格收货量，同一收货不能给多张发票重复使用。此微例accepted_cents表示已分配价值，付款差额可能为负。",
            45: "缺少广告预算记录时保留成熟同期群，获客成本与差额返回NULL；不能当作0支出或删除同期群。",
            50: "同比变化按2025年比率减2024年同季比率。毛利率下降超过3个百分点、费用率或人工率上升超过10个百分点、当期准时率低于60%各计1项。missing_count统计三项同比变化、当期履约率及准确季度末库存的未知项。",
        }
        for card in chapter["cards"]:
            tid = card.get("businessTaskId")
            if tid not in tasks:
                continue
            t = tasks[tid]
            number = int(tid[2:])
            card["businessResource"].update(
                title=t["title"],
                sourceTables=t["sourceTables"],
                note="关联逐题复审资源4.2.1；本卡微型示例保持独立，不代表企业主库结果。",
            )
            if number in additions:
                if number == 50:
                    card["back"]["explanation"] = additions[number]
                elif additions[number] not in card["back"]["explanation"]:
                    card["back"]["explanation"] += "\n" + additions[number]
            if number == 10:
                for field in ["tags", "referenceTopicNames"]:
                    if field in card:
                        card[field] = [
                            value.replace(
                                "补货优先级与供应商风险", "补货优先级与商品历史履约风险"
                            )
                            for value in card[field]
                        ]
            card["contentVersion"] = VERSION
        chapter["contentVersion"] = VERSION
        write(path, chapter)


if __name__ == "__main__":
    main()
