"""Portable checks of the current enterprise facts, independent of task SQL."""
from collections import Counter, defaultdict
from datetime import date

def business_checks(db):
    t = defaultdict(list)
    names = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    for name in names:
        cursor = db.execute('SELECT * FROM "' + name.replace('"', '""') + '"')
        columns = [item[0] for item in cursor.description]
        t[name] = [dict(zip(columns, row)) for row in cursor]
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
