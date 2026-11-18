"""Business invariants, independent-result validation, adversarial queries and performance evidence."""

from collections import Counter, defaultdict
from datetime import date
import csv
import json
import re
import sqlite3
import time
from repair_data import CONTENT, ORIGINAL, DBREL, OUT, connect, dump
from independent import Model
from sync_resources import query, sha
from sync_learning import matches


def fixture_db(fixture):
    if fixture.get("sharedDataPath"):
        shared = json.loads(
            (CONTENT / "question_resource" / fixture["sharedDataPath"]).read_text()
        )
        fixture = {**shared, **fixture}
    if fixture.get("baseDatabase"):
        source = connect(CONTENT / "question_resource" / fixture["baseDatabase"])
        db = connect(":memory:")
        source.backup(db)
        source.close()
    else:
        db = connect(":memory:")
        if fixture.get("setupSql"):
            db.executescript(fixture["setupSql"])
        for table in fixture.get("tables", []):
            cols = table["columns"]
            db.execute(
                'CREATE TABLE "'
                + table["name"]
                + '"('
                + ",".join(
                    '"' + c["name"] + '" ' + c.get("sqliteType", c.get("type", "TEXT"))
                    for c in cols
                )
                + ")"
            )
            if table["rows"]:
                db.executemany(
                    'INSERT INTO "'
                    + table["name"]
                    + '" VALUES('
                    + ",".join("?" for _ in cols)
                    + ")",
                    table["rows"],
                )
    db.execute("PRAGMA foreign_keys=ON")
    for sql in fixture.get("patchSql", []):
        db.execute(sql)
    return db


def business_checks(db):
    t = Model(db).t
    checks = []

    def add(name, violations):
        count = (
            sum(bool(v) for v in violations)
            if not isinstance(violations, int)
            else violations
        )
        checks.append({"name": name, "violations": count, "pass": count == 0})

    orders = {r["order_id"]: r for r in t["orders"]}
    items = {r["order_item_id"]: r for r in t["order_items"]}
    pos = {p["po_id"]: p for p in t["purchase_orders"]}
    pis = {p["po_item_id"]: p for p in t["purchase_order_items"]}
    invoices = {i["supplier_invoice_id"]: i for i in t["supplier_invoices"]}
    jobs = {j["employment_id"]: j for j in t["employment_history"]}
    employees = {e["employee_id"]: e for e in t["employees"]}
    products = {p["product_id"]: p for p in t["products"]}
    returns = defaultdict(list)
    for row in t["returns"]:
        returns[row["order_item_id"]].append(row)
    add(
        "退货日期不早于原交易，且仅来自已完成订单",
        [
            r["return_date"]
            < orders[items[r["order_item_id"]]["order_id"]]["order_date"]
            or orders[items[r["order_item_id"]]["order_id"]]["status"] != "completed"
            for r in t["returns"]
        ],
    )
    add(
        "累计退货不超过原销售数量",
        [
            sum(r["quantity"] for r in rows) > items[i]["quantity"]
            for i, rows in returns.items()
        ],
    )
    add(
        "退款按整行折后净额比例计算，半分向上到分",
        [
            r["refund_cents"]
            != (
                2
                * (
                    items[r["order_item_id"]]["quantity"]
                    * items[r["order_item_id"]]["unit_price_cents"]
                    - items[r["order_item_id"]]["discount_cents"]
                )
                * r["quantity"]
                + items[r["order_item_id"]]["quantity"]
            )
            // (2 * items[r["order_item_id"]]["quantity"])
            for r in t["returns"]
        ],
    )
    add(
        "折扣非负且不超过原销售额",
        [
            i["discount_cents"] < 0
            or i["discount_cents"] > i["quantity"] * i["unit_price_cents"]
            for i in items.values()
        ],
    )
    sessions = {s["session_id"]: s for s in t["customer_sessions"]}
    customers = {c["customer_id"]: c for c in t["customers"]}
    add(
        "会话与线上订单客户、日期一致",
        [
            o["customer_id"] != sessions[o["session_id"]]["customer_id"]
            or o["order_date"] != sessions[o["session_id"]]["session_date"]
            for o in orders.values()
            if o["channel"] == "online"
        ],
    )
    add(
        "会话和实名订单不早于客户注册日",
        [
            s["session_date"] < customers[s["customer_id"]]["signup_date"]
            for s in sessions.values()
        ]
        + [
            o["order_date"] < customers[o["customer_id"]]["signup_date"]
            for o in orders.values()
            if o["customer_id"] is not None
        ],
    )
    promos = {p["promotion_id"]: p for p in t["promotions"]}
    add(
        "明细促销编号的有效期间与原交易一致",
        [
            not (
                promos[i["promotion_id"]]["start_date"]
                <= orders[i["order_id"]]["order_date"]
                <= promos[i["promotion_id"]]["end_date"]
            )
            for i in items.values()
            if i["promotion_id"]
        ],
    )
    basket = Counter()
    for item in items.values():
        basket[item["order_id"]] += item["quantity"] * item["unit_price_cents"]
    promo_stores = defaultdict(set)
    promo_categories = defaultdict(set)
    for row in t["promotion_stores"]:
        promo_stores[row["promotion_id"]].add(row["store_id"])
    for row in t["promotion_categories"]:
        promo_categories[row["promotion_id"]].add(row["category_id"])
    errors = []
    for item in items.values():
        if not item["promotion_id"]:
            continue
        p = promos[item["promotion_id"]]
        o = orders[item["order_id"]]
        member = (
            customers[o["customer_id"]]["member_since_date"]
            if o["customer_id"]
            else None
        )
        invalid = (
            p["channel_scope"] not in ("all", o["channel"])
            or (
                p["store_scope"] == "selected"
                and o["store_id"] not in promo_stores[p["promotion_id"]]
            )
            or (
                p["category_scope"] == "selected"
                and products[item["product_id"]]["category_id"]
                not in promo_categories[p["promotion_id"]]
            )
            or (p["members_only"] and (not member or member > o["order_date"]))
            or basket[o["order_id"]] < p["min_basket_cents"]
        )
        errors.append(invalid)
    add("促销逐行符合渠道门店品类会员及折前篮子门槛", errors)
    add(
        "促销折扣严格符合活动万分比且半分向上取整",
        [
            i["discount_cents"]
            != (
                i["quantity"]
                * i["unit_price_cents"]
                * promos[i["promotion_id"]]["discount_basis_points"]
                + 5000
            )
            // 10000
            for i in items.values()
            if i["promotion_id"]
        ],
    )
    add(
        "停售后无新增销售订单",
        [
            products[i["product_id"]]["discontinued_date"] is not None
            and orders[i["order_id"]]["order_date"]
            >= products[i["product_id"]]["discontinued_date"]
            for i in items.values()
        ],
    )
    contracts = {c["contract_id"]: c for c in t["supplier_contracts"]}
    add(
        "采购合同商品、供应商及有效期间一致",
        [
            contracts[i["contract_id"]]["product_id"] != i["product_id"]
            or contracts[i["contract_id"]]["supplier_id"]
            != pos[i["po_id"]]["supplier_id"]
            or not (
                contracts[i["contract_id"]]["start_date"]
                <= pos[i["po_id"]]["order_date"]
                <= contracts[i["contract_id"]]["end_date"]
            )
            for i in pis.values()
        ],
    )
    received = Counter()
    for g in t["goods_receipts"]:
        received[g["po_item_id"]] += g["quantity_received"]
    add(
        "收货累计不超过采购量且不早于下单",
        [received[i] > p["quantity_ordered"] for i, p in pis.items()]
        + [
            g["receipt_date"] < pos[pis[g["po_item_id"]]["po_id"]]["order_date"]
            or pos[pis[g["po_item_id"]]["po_id"]]["status"] == "cancelled"
            or g["quantity_rejected"] > g["quantity_received"]
            for g in t["goods_receipts"]
        ],
    )
    add(
        "发票明细与采购单来源一致",
        [
            pis[i["po_item_id"]]["po_id"] != invoices[i["supplier_invoice_id"]]["po_id"]
            for i in t["supplier_invoice_items"]
        ],
    )
    add(
        "付款和批准贷项不早于对应发票",
        [
            p["payment_date"] < invoices[p["supplier_invoice_id"]]["invoice_date"]
            for p in t["supplier_payments"]
        ]
        + [
            p["credit_date"] < invoices[p["supplier_invoice_id"]]["invoice_date"]
            for p in t["supplier_credit_notes"]
        ],
    )
    moves = defaultdict(list)
    for m in t["stock_movements"]:
        moves[m["movement_type"]].append(m)
    sales = Counter()
    for m in moves["sale"]:
        sales[m["order_item_id"]] -= m["quantity_delta"]
    add(
        "已完成销售逐行精确出库，非完成订单无销售出库",
        [
            sales[i["order_item_id"]]
            != (i["quantity"] if orders[i["order_id"]]["status"] == "completed" else 0)
            for i in items.values()
        ],
    )
    receipts = {g["receipt_id"]: g for g in t["goods_receipts"]}
    receipt_posted = Counter()
    for m in moves["receipt"]:
        receipt_posted[m["receipt_id"]] += m["quantity_delta"]
    add(
        "所有质检合格收货逐笔精确入库",
        [
            receipt_posted[k] != g["quantity_received"] - g["quantity_rejected"]
            for k, g in receipts.items()
        ],
    )
    return_posted = Counter()
    for m in moves["return"]:
        return_posted[m["return_id"]] += m["quantity_delta"]
    add(
        "每笔退货与对应库存流水一致",
        [return_posted[r["return_id"]] != r["quantity"] for r in t["returns"]],
    )
    tr = defaultdict(list)
    for m in moves["transfer_in"] + moves["transfer_out"]:
        tr[m["transfer_id"]].append(m)
    add(
        "调拨发出与到货的仓库、日期、商品、数量及成本一致",
        [
            len(tr[x["transfer_id"]]) != (2 if x["received_date"] else 1)
            or sorted(
                (m["warehouse_id"], m["quantity_delta"]) for m in tr[x["transfer_id"]]
            )
            != sorted(
                [(x["from_warehouse_id"], -x["quantity"])]
                + (
                    [(x["to_warehouse_id"], x["quantity"])]
                    if x["received_date"]
                    else []
                )
            )
            or any(
                m["product_id"] != x["product_id"]
                or m["movement_date"]
                != (
                    x["transfer_date"]
                    if m["movement_type"] == "transfer_out"
                    else x["received_date"]
                )
                or m["unit_cost_cents"] != x["unit_cost_cents"]
                for m in tr[x["transfer_id"]]
            )
            or (
                x["received_date"] is not None
                and x["received_date"] < x["transfer_date"]
            )
            for x in t["stock_transfers"]
        ],
    )
    loss = Counter()
    for m in moves["loss"]:
        loss[m["adjustment_id"]] -= m["quantity_delta"]
    add(
        "损耗单与库存负向流水精确对应",
        [
            loss[a["adjustment_id"]] != a["quantity_lost"]
            for a in t["stock_adjustments"]
        ],
    )
    stock = Counter(
        {
            (i["warehouse_id"], i["product_id"]): i["quantity"]
            for i in t["inventory_opening"]
        }
    )
    negatives = 0
    snapshots = defaultdict(list)
    for i in t["inventory_snapshots"]:
        snapshots[i["snapshot_date"]].append(i)
    ordered = sorted(
        t["stock_movements"], key=lambda m: (m["movement_date"], m["movement_id"])
    )
    idx = 0
    differences = 0
    for day, snaps in sorted(snapshots.items()):
        while idx < len(ordered) and ordered[idx]["movement_date"] <= day:
            m = ordered[idx]
            key = m["warehouse_id"], m["product_id"]
            stock[key] += m["quantity_delta"]
            negatives += stock[key] < 0
            idx += 1
        differences += sum(
            stock[i["warehouse_id"], i["product_id"]] != i["quantity"] for i in snaps
        )
    add("每个库存事件后可售库存非负", negatives)
    add("全部54000个月末仓库商品快照可从流水重建", differences)
    costs = defaultdict(list)
    for c in t["product_costs"]:
        costs[c["product_id"]].append(c)
    for rows in costs.values():
        rows.sort(key=lambda r: r["effective_date"])

    def cost_at(pid, day):
        return next(
            c["unit_cost_cents"]
            for c in reversed(costs[pid])
            if c["effective_date"] <= day
        )

    add(
        "销售成交成本与当日历史标准成本一致",
        [
            i["unit_cost_cents"]
            != cost_at(i["product_id"], orders[i["order_id"]]["order_date"])
            for i in items.values()
        ],
    )
    add(
        "库存快照标准成本与历史有效期间一致",
        [
            i["unit_cost_cents"] != cost_at(i["product_id"], i["snapshot_date"])
            for i in t["inventory_snapshots"]
        ],
    )
    histories = defaultdict(list)
    for h in jobs.values():
        histories[h["employee_id"]].append(h)
    history_errors = 0
    for eid, hs in histories.items():
        hs.sort(key=lambda h: h["start_date"])
        e = employees[eid]
        history_errors += hs[0]["start_date"] != e["hire_date"]
        history_errors += hs[-1]["end_date"] != e["termination_date"]
        history_errors += sum(
            a["end_date"] != b["start_date"] or a["start_date"] >= a["end_date"]
            for a, b in zip(hs, hs[1:])
        )
    add("员工任职覆盖整个雇佣期间，无重叠或空档", history_errors)
    add(
        "考勤仅发生在雇佣有效期间且加班属于出勤日",
        [
            a["attendance_date"] < employees[a["employee_id"]]["hire_date"]
            or (
                employees[a["employee_id"]]["termination_date"] is not None
                and a["attendance_date"]
                >= employees[a["employee_id"]]["termination_date"]
            )
            or (a["status"] != "present" and a["overtime_minutes"] != 0)
            for a in t["attendance"]
        ],
    )
    salary_errors = 0
    for s in t["salary_history"]:
        h = jobs[s["employment_id"]]
        e = employees[s["employee_id"]]
        m = s["month_key"]
        last = date(
            int(m[:4]),
            int(m[5:]),
            __import__("calendar").monthrange(int(m[:4]), int(m[5:]))[1],
        )
        last = (
            min(
                last,
                date.fromisoformat(e["termination_date"])
                - __import__("datetime").timedelta(days=1),
            )
            if e["termination_date"]
            else last
        )
        salary_errors += h["employee_id"] != s["employee_id"] or not (
            h["start_date"] <= str(last)
            and (h["end_date"] is None or str(last) < h["end_date"])
        )
    add("薪资归属当月最后在职岗位", salary_errors)
    journal = Counter()
    debits = Counter()
    for l in t["journal_lines"]:
        journal[l["entry_id"]] += l["debit_cents"] - l["credit_cents"]
        debits[l["entry_id"]] += l["debit_cents"]
    docs = {d["entry_id"]: d for d in t["expense_documents"]}
    add(
        "凭证借贷平衡且与来源费用单据金额一致",
        [
            journal[e["entry_id"]] != 0
            or e["entry_id"] not in docs
            or docs[e["entry_id"]]["amount_cents"] != debits[e["entry_id"]]
            for e in t["journal_entries"]
        ],
    )
    bad_dates = []
    for name, rows in t.items():
        if name == "raw_order_import":
            continue
        for row in rows:
            for col, value in row.items():
                if value is not None and (col.endswith("_date") or col == "day"):
                    try:
                        date.fromisoformat(value)
                    except (ValueError, TypeError):
                        bad_dates.append((name, col, value))
    add("正常业务日期有效，原始导入脏日期隔离检查", len(bad_dates))
    return checks


def wrong_solutions(q):
    sql = q["sqliteSql"]
    candidates = []
    for e in q.get("commonErrors", []):
        if e.get("sql"):
            candidates.append(("原典型错误：" + e.get("reason", ""), e["sql"]))
    changes = [
        ("累加误用平均", "SUM(", "AVG("),
        ("去重计数误用行数", "COUNT(DISTINCT ", "COUNT("),
        ("遗漏主档或空行", "LEFT JOIN", "JOIN"),
        ("错误时间范围", "'2025-01-01'", "'2025-02-01'"),
        ("错误月份范围", "'2025-01'", "'2025-02'"),
        ("错误渠道", "channel='store'", "channel='online'"),
        ("条件方向颠倒", "<>", "="),
        ("错误决胜顺序", " DESC", " ASC"),
        ("错误截止日", "'2025-12-31'", "'2025-11-30'"),
        ("错误抵扣远期在途", "'2026-01-30'", "'2026-12-31'"),
        ("遗漏跨年窗口", "'2024-11'", "'2025-01'"),
        ("错误收入分母", "NULLIF(a.net,0)", "NULLIF(a.cost,0)"),
        ("遗漏部分付款", "SUM(amount_cents)", "MAX(amount_cents)"),
    ]
    for label, old, new in changes:
        if old in sql:
            candidates.append((label, sql.replace(old, new)))
    if "EXISTS(SELECT 1 FROM promotions p" in sql:
        wrong = sql.replace(
            "EXISTS(SELECT 1 FROM promotions p WHERE day BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store'))",
            "p.promotion_id IS NOT NULL",
        )
        wrong = wrong.replace(
            "FROM calendar_days WHERE day BETWEEN",
            "FROM calendar_days LEFT JOIN promotions p ON day BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store') WHERE day BETWEEN",
            1,
        )
        candidates.insert(0, ("重叠活动日期连接导致重复销售与日数", wrong))
    seen = set()
    out = []
    for label, s in candidates:
        if s != sql and s not in seen:
            seen.add(s)
            out.append((label, s))
    return out[:8]


def hardcode(expected):
    columns = expected["columns"]
    rows = expected["rows"]

    def literal(v):
        return (
            "NULL"
            if v is None
            else (
                str(v)
                if isinstance(v, (int, float))
                else "'" + str(v).replace("'", "''") + "'"
            )
        )

    if not rows:
        return (
            "SELECT " + ",".join("NULL AS `" + c + "`" for c in columns) + " WHERE 1=0"
        )
    parts = []
    for start in range(0, len(rows), 350):
        statements = [
            "SELECT "
            + ",".join(
                literal(v) + ((" AS `" + columns[i] + "`") if j == 0 else "")
                for i, v in enumerate(row)
            )
            for j, row in enumerate(rows[start : start + 350])
        ]
        parts.append("SELECT * FROM (" + " UNION ALL ".join(statements) + ")")
    return " UNION ALL ".join(parts)


def main():
    db = connect(CONTENT / DBREL)
    checks = business_checks(db)
    oldchecks = json.loads(
        (ORIGINAL / "enterprise_reference/validation/checks.json").read_text()
    )["businessChecks"]
    for check in oldchecks:
        if check["name"] == "库存成本历史匹配":
            check["sql"] = "SELECT COUNT(*) FROM inventory_snapshots i LEFT JOIN product_costs p ON p.product_id=i.product_id AND p.effective_date=(SELECT MAX(c.effective_date) FROM product_costs c WHERE c.product_id=i.product_id AND c.effective_date<=i.snapshot_date) WHERE p.cost_id IS NULL OR i.unit_cost_cents<>p.unit_cost_cents"
        count = db.execute(check["sql"]).fetchone()[0]
        checks.append(
            {
                "name": "保留回归：" + check["name"],
                "violations": count,
                "pass": count == 0,
            }
        )
    dump(OUT / "business-invariants.json", checks)
    dump(CONTENT / "enterprise_reference/validation/checks.json", {"contentVersion":"4.2.0", "businessChecks":checks,"retainedSqlChecks":oldchecks,"evidence":"artifacts/enterprise-audit/task-audit.json contains independently verified executions for all 50 tasks; historical boundary examples remain in the immutable backup."})
    if not all(c["pass"] for c in checks):
        raise AssertionError([c for c in checks if not c["pass"]])
    # Every CSV cell is checked against its SQLite source, including explicit NULL sentinels.
    csv_checks = []
    for source, label in [(ORIGINAL, "before"), (CONTENT, "after")]:
        source_db = connect(source / DBREL)
        for path in sorted(
            (source / "enterprise_reference/structured_data").glob("*.csv")
        ):
            name = path.stem
            with path.open(newline="") as inp:
                reader = csv.reader(inp)
                header = next(reader)
                cursor = source_db.execute(
                    "SELECT " + ",".join(header) + " FROM " + name
                )
                count = 0
                for expected in cursor:
                    actual = next(reader, None)
                    assert actual == [
                        r"\N" if v is None else str(v) for v in expected
                    ], (label, name, count)
                    count += 1
                assert next(reader, None) is None
            csv_checks.append(
                {"version": label, "table": name, "rows": count, "pass": True}
            )
        source_db.close()
    dump(OUT / "csv-roundtrip.json", csv_checks)
    # Shared tables must be byte-value identical to the canonical enterprise facts.
    shared = []
    manifest = json.loads(
        (CONTENT / "question_resource/databases/manifest.json").read_text()
    )
    for dataset in manifest["datasets"]:
        source = connect(CONTENT / "question_resource" / dataset["path"])
        assert sha(CONTENT / "question_resource" / dataset["path"]) == dataset["sha256"]
        assert source.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert not source.execute("PRAGMA foreign_key_check").fetchall()
        for (name,) in source.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ):
            a = source.execute("SELECT * FROM " + name + " ORDER BY 1")
            b = db.execute("SELECT * FROM " + name + " ORDER BY 1")
            count = 0
            for row in a:
                assert list(row) == list(next(b)), (dataset["id"], name)
                count += 1
            assert b.fetchone() is None
            shared.append(
                {"dataset": dataset["id"], "table": name, "rows": count, "match": True}
            )
        source.close()
    dump(OUT / "shared-data.json", shared)
    results = []
    for ch in [19, 20]:
        for q in json.loads(
            (CONTENT / f"question_resource/questions/ch{ch}.json").read_text()
        )["questions"]:
            fixtures = []
            for entry in q["testFixtures"]:
                path = CONTENT / "question_resource" / entry["path"]
                assert sha(path) == entry["sha256"]
                f = json.loads(path.read_text())
                if f.get("sharedDataPath"):
                    assert (
                        sha(CONTENT / "question_resource" / f["sharedDataPath"])
                        == f["sharedDataSha256"]
                    )
                fixtures.append((entry, f, fixture_db(f)))
            tolerance = q["numericTolerance"]["absolute"]
            tests = []
            candidates = wrong_solutions(q) + [
                ("硬编码公开结果", hardcode(fixtures[0][1]["expected"]))
            ]
            for label, sql in candidates:
                outcomes = []
                for entry, f, fixture in fixtures:
                    try:
                        start = time.perf_counter()
                        actual = query(fixture, sql)
                        elapsed = (time.perf_counter() - start) * 1000
                        passed = actual["columns"] == f["expected"][
                            "columns"
                        ] and matches(actual["rows"], f["expected"]["rows"], tolerance)
                        outcomes.append(
                            {
                                "fixture": entry["id"],
                                "executed": True,
                                "accepted": passed,
                                "rows": len(actual["rows"]),
                                "elapsedMs": round(elapsed, 3),
                            }
                        )
                    except sqlite3.Error as error:
                        outcomes.append(
                            {
                                "fixture": entry["id"],
                                "executed": False,
                                "accepted": False,
                                "error": str(error),
                            }
                        )
                tests.append(
                    {
                        "kind": label,
                        "sql": sql,
                        "rejected": not all(o["accepted"] for o in outcomes),
                        "outcomes": outcomes,
                    }
                )
            assert any(
                t["rejected"]
                and any(o["executed"] and not o["accepted"] for o in t["outcomes"])
                for t in tests
                if t["kind"] != "硬编码公开结果"
            ), q["id"]
            if q["taskId"] == "BP29":
                for test in tests:
                    if test["kind"] == "累加误用平均" and not test["rejected"]:
                        test["kind"] = (
                            "等价解：同一行集AVG金额/AVG数量与SUM金额/SUM数量相等"
                        )
                        test["classification"] = "equivalent"
            hard = tests[-1]
            assert hard["outcomes"][0]["accepted"], (
                "Hardcode must actually pass public",
                q["id"],
                hard["outcomes"][0],
            )
            assert hard["rejected"], ("Hardcode escaped", q["id"])
            results.append(
                {
                    "question": q["id"],
                    "task": q["taskId"],
                    "tested": len(tests),
                    "rejected": sum(t["rejected"] for t in tests),
                    "survivingMutants": [
                        t["kind"]
                        for t in tests
                        if not t["rejected"] and t.get("classification") != "equivalent"
                    ],
                    "tests": tests,
                }
            )
            for _, _, fixture in fixtures:
                fixture.close()
            print(
                q["id"],
                "mutants",
                sum(t["rejected"] for t in tests),
                "/",
                len(tests),
                flush=True,
            )
    dump(OUT / "wrong-solutions.json", results)
    db.close()
    print("Business, CSV, shared-table and adversarial-query audit passed", flush=True)


if __name__ == "__main__":
    main()
