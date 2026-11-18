"""Independent compact enterprise scenarios with a separate generator and new business identities."""

from collections import defaultdict, Counter
from datetime import date, timedelta
import calendar
import random
import sqlite3
from repair_data import START, END, DAYS, MONTHENDS, connect


def scenario(canonical, seed):
    r = random.Random(seed)
    t = defaultdict(list)

    def add(name, **row):
        t[name].append(row)
        return row

    for i, d in enumerate(DAYS):
        add("calendar_days", day=str(d), month_key=str(d)[:7], day_index=i)
    for i in range(1, 4):
        add("stores", store_id=i, store_name=f"独立门店{i}", city="模拟地区")
        add("warehouses", warehouse_id=i, warehouse_name=f"独立仓库{i}")
        add(
            "suppliers",
            supplier_id=i,
            supplier_name=f"独立供应商{i}",
            region="本地" if i == 1 else "区域",
        )
    add("stores", store_id=4, store_name="未开业门店", city="模拟地区")
    add("suppliers", supplier_id=4, supplier_name="尚无采购供应商", region="本地")
    add("traffic_sources", source_id=6, source_name="尚无访问渠道")
    for i in range(1, 4):
        add("categories", category_id=i, category_name=f"独立类别{i}")
    for i in range(1, 8):
        add("departments", department_id=i, department_name=f"独立部门{i}")
    for i in range(1, 6):
        add("positions", position_id=i, position_name=f"独立职位{i}", grade=i)
        add("traffic_sources", source_id=i, source_name=f"独立渠道{i}")
    for i in range(1, 7):
        add(
            "accounts",
            account_id=i,
            account_name=f"科目{i}",
            account_type="cash" if i == 6 else "expense",
        )
    prices = {}
    costs = {}
    for i in range(1, 21):
        prices[i] = r.randint(12, 200) * 100
        costs[i] = round(prices[i] * r.uniform(0.4, 0.88))
        add(
            "products",
            product_id=i,
            category_id=(i - 1) % 3 + 1,
            product_name=f"独立商品{i}",
            list_price_cents=prices[i],
            reorder_level=r.randint(3, 25),
            active=1,
        )
        for y in [2023, 2024, 2025]:
            add(
                "product_costs",
                cost_id=len(t["product_costs"]) + 1,
                product_id=i,
                effective_date=f"{y}-01-01",
                unit_cost_cents=costs[i],
            )
    add("suppliers", supplier_id=5, supplier_name="无交易供应商", region="本地")
    add("categories", category_id=4, category_name="尚未销售类别")
    prices[21] = 10000
    costs[21] = 6000
    add(
        "products",
        product_id=21,
        category_id=4,
        product_name="尚未销售商品",
        list_price_cents=10000,
        reorder_level=10,
        active=1,
    )
    for y in [2023, 2024, 2025]:
        add(
            "product_costs",
            cost_id=len(t["product_costs"]) + 1,
            product_id=21,
            effective_date=f"{y}-01-01",
            unit_cost_cents=6000,
        )
    for i in range(1, 15):
        add(
            "customers",
            customer_id=i,
            customer_name=f"独立客户{i}",
            signup_date="2023-01-01",
            region=None if r.random() < 0.15 else "本地",
        )
    for i, y in enumerate([2024, 2025], 1):
        add(
            "promotions",
            promotion_id=i,
            promotion_name="年末活动",
            discount_basis_points=2000,
            start_date=f"{y}-11-08",
            end_date=f"{y}-11-17",
        )
    add(
        "promotions",
        promotion_id=3,
        promotion_name="重叠会员测试活动",
        start_date="2025-11-11",
        end_date="2025-11-22",
        discount_basis_points=1000,
    )
    add(
        "promotions",
        promotion_id=4,
        promotion_name="线上专属跨年测试",
        start_date="2025-12-25",
        end_date="2026-01-04",
        channel_scope="online",
        discount_basis_points=1200,
    )
    for monthend in MONTHENDS:
        m = str(monthend)[:7]
        for s in range(1, 6):
            add(
                "marketing_campaigns",
                campaign_id=len(t["marketing_campaigns"]) + 1,
                source_id=s,
                month_key=m,
                spend_cents=0 if s == 1 else r.randint(50, 300) * 100,
            )
        for store in range(1, 4):
            add(
                "sales_targets",
                target_id=len(t["sales_targets"]) + 1,
                store_id=store,
                month_key=m,
                target_cents=(
                    0
                    if store == 3 and monthend.year == 2025
                    else r.randint(2000, 10000) * 100
                ),
            )
        for dep in range(1, 8):
            for a in range(1, 6):
                add(
                    "budgets",
                    budget_id=len(t["budgets"]) + 1,
                    department_id=dep,
                    account_id=a,
                    month_key=m,
                    budget_cents=0 if a == 5 else 80000 + r.randint(0, 10000),
                )
    contracts = {}
    for s in range(1, 4):
        for p in range(1, 21):
            for y in [2023, 2024, 2025]:
                contracts[s, p, y] = add(
                    "supplier_contracts",
                    contract_id=len(t["supplier_contracts"]) + 1,
                    supplier_id=s,
                    product_id=p,
                    start_date=f"{y}-01-01",
                    end_date=f"{y}-12-31",
                    unit_price_cents=round(costs[p] * (0.9 + s * 0.06)),
                )
    events = []
    for n in range(1, 73):
        s = r.choice([1, 2, 3])
        p = r.choice(range(1, 21))
        month = (n - 1) % 12 + 1
        year = 2024 if n <= 12 else 2025
        d = date(year, month, r.randint(1, 18))
        prom = d + timedelta(days=[4, 12, 22][s - 1])
        contract = contracts[s, p, year]
        qty = r.randint(5, 70)
        price = round(contract["unit_price_cents"] * (1.14 if r.random() < 0.15 else 1))
        po = add(
            "purchase_orders",
            po_id=n,
            supplier_id=s,
            warehouse_id=r.choice([1, 2, 3]),
            order_date=str(d),
            promised_date=str(prom),
            status="cancelled" if n == 3 else "placed",
        )
        pi = add(
            "purchase_order_items",
            po_item_id=n,
            po_id=n,
            product_id=p,
            contract_id=contract["contract_id"],
            quantity_ordered=qty,
            unit_price_cents=price,
        )
        if po["status"] == "cancelled":
            continue
        received = qty if r.random() > 0.3 else max(1, qty // 2)
        reject = 1 if received > 1 and r.random() < 0.14 else 0
        rd = min(END, max(d, prom + timedelta(days=r.randint(-3, 12))))
        receipt = add(
            "goods_receipts",
            receipt_id=len(t["goods_receipts"]) + 1,
            po_item_id=n,
            receipt_date=str(rd),
            quantity_received=received,
            quantity_rejected=reject,
        )
        if received > reject:
            events.append(
                (
                    str(rd),
                    po["warehouse_id"],
                    p,
                    "receipt",
                    received - reject,
                    price,
                    None,
                    receipt["receipt_id"],
                    None,
                    None,
                    None,
                )
            )
        inv = add(
            "supplier_invoices",
            supplier_invoice_id=n,
            po_id=n,
            invoice_no="DUP-SAME-SUPPLIER" if s == 1 and n < 25 else f"ISO-{seed}-{n}",
            invoice_date=str(d),
            due_date=str(d + timedelta(days=r.choice([15, 30, 60]))),
        )
        billed = received - reject + (2 if r.random() < 0.15 else 0)
        billed = max(1, billed)
        add(
            "supplier_invoice_items",
            supplier_invoice_item_id=len(t["supplier_invoice_items"]) + 1,
            supplier_invoice_id=n,
            po_item_id=n,
            quantity_billed=billed,
            unit_price_cents=price,
        )
        total = billed * price
        if r.random() < 0.12:
            add(
                "supplier_credit_notes",
                credit_note_id=len(t["supplier_credit_notes"]) + 1,
                supplier_invoice_id=n,
                credit_date=str(min(END, d + timedelta(days=5))),
                amount_cents=max(1, total // 20),
                reason="批准折让",
            )
        paid = round(total * r.choice([0, 0.4, 1, 1.1]))
        pd = d + timedelta(days=8)
        if paid and pd <= END:
            split = [paid // 2, paid - paid // 2] if r.random() < 0.4 else [paid]
            for amount in split:
                add(
                    "supplier_payments",
                    supplier_payment_id=len(t["supplier_payments"]) + 1,
                    supplier_invoice_id=n,
                    payment_date=str(pd),
                    amount_cents=amount,
                )
    for n in range(1, 181):
        year = 2024 if n <= 40 else 2025
        month = r.choices(range(1, 13), weights=[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3])[0]
        d = date(year, month, r.randint(1, 27))
        online = r.random() < 0.55
        uid = r.choices(
            range(1, 15), weights=[10, 8, 6, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1]
        )[0]
        sid = None
        store = None if online else r.choice([1, 1, 2, 3])
        status = "cancelled" if r.random() < 0.08 else "completed"
        if seed == 202611179 and year == 2025 and month in (4, 5, 6):
            status = "cancelled"
        if online:
            sid = n
            add(
                "customer_sessions",
                session_id=sid,
                customer_id=uid,
                source_id=r.choice([1, 1, 2, 3, 4, 5]),
                session_date=str(d),
            )
        add(
            "orders",
            order_id=n,
            store_id=store,
            customer_id=uid,
            session_id=sid,
            order_date=str(d),
            channel="online" if online else "store",
            status=status,
        )
        amount = 0
        for k in range(r.randint(1, 3)):
            p = r.choices(range(1, 21), weights=[20, 15, 10, 5] + [1] * 16)[0]
            qty = r.randint(1, 5)
            promo = 1 if year == 2024 else 2
            promo = promo if month == 11 and 8 <= d.day <= 17 else None
            discount = round(prices[p] * qty * 0.2) if promo else 0
            net = prices[p] * qty - discount
            amount += net
            item = add(
                "order_items",
                order_item_id=len(t["order_items"]) + 1,
                order_id=n,
                product_id=p,
                promotion_id=promo,
                quantity=qty,
                unit_price_cents=prices[p],
                discount_cents=discount,
                unit_cost_cents=costs[p],
            )
            if status == "completed":
                w = (store - 1) % 3 + 1 if store else 1
                events.append(
                    (
                        str(d),
                        w,
                        p,
                        "sale",
                        -qty,
                        costs[p],
                        item["order_item_id"],
                        None,
                        None,
                        None,
                        None,
                    )
                )
                rd = d + timedelta(days=r.randint(2, 25))
                if rd <= END and r.random() < 0.12:
                    refundqty = r.randint(1, qty)
                    ret = add(
                        "returns",
                        return_id=len(t["returns"]) + 1,
                        order_item_id=item["order_item_id"],
                        return_date=str(rd),
                        quantity=refundqty,
                        refund_cents=(2 * net * refundqty + qty) // (2 * qty),
                    )
                    events.append(
                        (
                            str(rd),
                            w,
                            p,
                            "return",
                            refundqty,
                            costs[p],
                            item["order_item_id"],
                            None,
                            ret["return_id"],
                            None,
                            None,
                        )
                    )
        if status == "completed":
            add(
                "payments",
                payment_id=len(t["payments"]) + 1,
                order_id=n,
                payment_date=str(d),
                amount_cents=amount + (17 if n == 120 else 0),
                status="settled",
            )
    # October 3 has a complete 0–89 day window at December 31, October 4 does not.
    for uid, day in [(16, "2025-10-03"), (17, "2025-10-04")]:
        oid = 300 + uid
        add(
            "customers",
            customer_id=uid,
            customer_name=f"观察期边界客户{uid}",
            signup_date=day,
            region=None,
        )
        add(
            "customer_sessions",
            session_id=oid,
            customer_id=uid,
            source_id=2,
            session_date=day,
        )
        add(
            "orders",
            order_id=oid,
            store_id=None,
            customer_id=uid,
            session_id=oid,
            order_date=day,
            channel="online",
            status="completed",
        )
        item = add(
            "order_items",
            order_item_id=len(t["order_items"]) + 1,
            order_id=oid,
            product_id=1,
            promotion_id=None,
            quantity=1,
            unit_price_cents=prices[1],
            discount_cents=0,
            unit_cost_cents=costs[1],
        )
        events.append(
            (
                day,
                1,
                1,
                "sale",
                -1,
                costs[1],
                item["order_item_id"],
                None,
                None,
                None,
                None,
            )
        )
        add(
            "payments",
            payment_id=len(t["payments"]) + 1,
            order_id=oid,
            payment_date=day,
            amount_cents=prices[1],
            status="settled",
        )
    # A second valid checkout within the same visit must not become a second converted session.
    first = next(
        o
        for o in t["orders"]
        if o["channel"] == "online"
        and o["status"] == "completed"
        and o["order_date"] >= "2025-01-01"
    )
    add("orders", **dict(first, order_id=181))
    original = next(i for i in t["order_items"] if i["order_id"] == first["order_id"])
    item = add(
        "order_items",
        **dict(
            original,
            order_item_id=len(t["order_items"]) + 1,
            order_id=181,
            quantity=1,
            discount_cents=0,
        ),
    )
    events.append(
        (
            first["order_date"],
            1,
            item["product_id"],
            "sale",
            -1,
            item["unit_cost_cents"],
            item["order_item_id"],
            None,
            None,
            None,
            None,
        )
    )
    add(
        "payments",
        payment_id=len(t["payments"]) + 1,
        order_id=181,
        payment_date=first["order_date"],
        amount_cents=item["unit_price_cents"],
        status="settled",
    )
    # An invoiced cancelled order with no receipt history represents an advance invoice dispute.
    cid = len(t["supplier_contracts"]) + 1
    add(
        "supplier_contracts",
        contract_id=cid,
        supplier_id=4,
        product_id=1,
        start_date="2025-01-01",
        end_date="2025-12-31",
        unit_price_cents=costs[1],
    )
    add(
        "purchase_orders",
        po_id=1000,
        supplier_id=4,
        warehouse_id=1,
        order_date="2025-10-01",
        promised_date="2025-10-15",
        status="cancelled",
    )
    add(
        "purchase_order_items",
        po_item_id=1000,
        po_id=1000,
        product_id=1,
        contract_id=cid,
        quantity_ordered=100,
        unit_price_cents=10000,
    )
    add(
        "supplier_invoices",
        supplier_invoice_id=1000,
        po_id=1000,
        invoice_no="ADVANCE-DISPUTE",
        invoice_date="2025-10-02",
        due_date="2025-10-31",
    )
    add(
        "supplier_invoice_items",
        supplier_invoice_item_id=len(t["supplier_invoice_items"]) + 1,
        supplier_invoice_id=1000,
        po_item_id=1000,
        quantity_billed=100,
        unit_price_cents=10000,
    )
    # A few visits without orders distinguish sessions from converted sessions.
    for n in range(201, 251):
        add(
            "customer_sessions",
            session_id=n,
            customer_id=r.randint(1, 14),
            source_id=r.randint(1, 5),
            session_date=f"2025-{r.randint(1,12):02}-01",
        )
    for n in range(1, 9):
        p = r.randint(1, 20)
        qty = r.randint(1, 5)
        d = f"2025-{r.randint(1,12):02}-15"
        source, target = r.sample([1, 2, 3], 2)
        tr = add(
            "stock_transfers",
            transfer_id=n,
            product_id=p,
            from_warehouse_id=source,
            to_warehouse_id=target,
            transfer_date=d,
            expected_receipt_date=d,
            received_date=d,
            unit_cost_cents=costs[p],
            quantity=qty,
        )
        events.append(
            (d, source, p, "transfer_out", -qty, costs[p], None, None, None, n, None)
        )
        events.append(
            (d, target, p, "transfer_in", qty, costs[p], None, None, None, n, None)
        )
    for n in range(1, 6):
        p = r.randint(1, 20)
        w = r.randint(1, 3)
        d = f"2025-{r.randint(1,12):02}-20"
        add(
            "stock_adjustments",
            adjustment_id=n,
            warehouse_id=w,
            product_id=p,
            adjustment_date=d,
            quantity_lost=2,
            reason="盘点损耗",
        )
        events.append((d, w, p, "loss", -2, costs[p], None, None, None, None, n))
    stock = {}
    for w in [1, 2, 3]:
        for p in range(1, 22):
            qty = r.randint(150, 450)
            stock[w, p] = qty
            add(
                "inventory_opening",
                opening_id=len(t["inventory_opening"]) + 1,
                warehouse_id=w,
                product_id=p,
                quantity=qty,
            )
    events.sort(key=lambda e: (e[0], e[4] < 0))
    idx = 0
    for end in MONTHENDS:
        while idx < len(events) and events[idx][0] <= str(end):
            d, w, p, kind, qty, cost, oi, receipt, ret, tr, adj = events[idx]
            stock[w, p] += qty
            assert stock[w, p] >= 0
            add(
                "stock_movements",
                movement_id=len(t["stock_movements"]) + 1,
                warehouse_id=w,
                product_id=p,
                movement_date=d,
                movement_type=kind,
                quantity_delta=qty,
                unit_cost_cents=cost,
                order_item_id=oi,
                receipt_id=receipt,
                return_id=ret,
                transfer_id=tr,
                adjustment_id=adj,
            )
            idx += 1
        for (w, p), qty in stock.items():
            add(
                "inventory_snapshots",
                snapshot_id=len(t["inventory_snapshots"]) + 1,
                warehouse_id=w,
                product_id=p,
                snapshot_date=str(end),
                quantity=qty,
                unit_cost_cents=costs[p],
            )
    for n in range(1, 15):
        hire = "2023-01-01" if n <= 8 else f"2025-0{r.randint(1,8)}-01"
        term = "2025-12-01" if n == 6 else None
        if n == 13:
            hire = "2025-11-15"
        if n == 14:
            hire = "2025-10-02"
            term = "2025-12-31"
        dep = 1 if n <= 8 else 2
        store = 1 if n <= 4 else 2 if n <= 8 else None
        add(
            "employees",
            employee_id=n,
            employee_name=f"独立员工{n}",
            hire_date=hire,
            termination_date=term,
        )
        add(
            "employment_history",
            employment_id=n,
            employee_id=n,
            department_id=dep,
            position_id=2,
            store_id=store,
            start_date=hire,
            end_date=term,
        )
        for end in MONTHENDS:
            m = str(end)[:7]
            if str(end) < hire or (term and m + "-01" >= term):
                continue
            add(
                "salary_history",
                salary_id=len(t["salary_history"]) + 1,
                employee_id=n,
                employment_id=n,
                month_key=m,
                base_cents=round(
                    (250000 if n != 3 else 450000) * r.uniform(0.95, 1.05)
                ),
                bonus_cents=10000 if end.month == 12 else 0,
            )
        for day in DAYS:
            if str(day) < hire or (term and str(day) >= term) or day.weekday() > 4:
                continue
            add(
                "attendance",
                attendance_id=len(t["attendance"]) + 1,
                employee_id=n,
                attendance_date=str(day),
                status="present",
                work_minutes=480,
                overtime_minutes=r.choice([0, 0, 30, 60]),
            )
    for n in range(1, 81):
        d = f"2025-{r.randint(1,12):02}-{r.randint(1,27):02}"
        dep = r.choice([1, 1, 2, 3])
        store = r.choice([1, 2, 3]) if dep == 1 else None
        amount = r.randint(50, 500) * 100
        ref = f"ISOJ-{n}"
        add(
            "journal_entries",
            entry_id=n,
            entry_date=d,
            department_id=dep,
            store_id=store,
            reference_no=ref,
        )
        add(
            "journal_lines",
            line_id=2 * n - 1,
            entry_id=n,
            account_id=r.randint(1, 5),
            debit_cents=amount,
            credit_cents=0,
        )
        add(
            "journal_lines",
            line_id=2 * n,
            entry_id=n,
            account_id=6,
            debit_cents=0,
            credit_cents=amount,
        )
        add(
            "expense_documents",
            document_id=n,
            entry_id=n,
            document_date=d,
            amount_cents=amount,
            document_type="独立费用单据",
        )
        if r.random() < 0.9:
            add(
                "bank_transactions",
                bank_id=len(t["bank_transactions"]) + 1,
                transaction_date=d,
                reference_no=None if r.random() < 0.08 else ref,
                amount_cents=-amount + (100 if n == 5 else 0),
            )
    reference = next(
        b["reference_no"] for b in t["bank_transactions"] if b["reference_no"]
    )
    entry = next(e for e in t["journal_entries"] if e["reference_no"] == reference)
    expense = next(
        l
        for l in t["journal_lines"]
        if l["entry_id"] == entry["entry_id"] and l["debit_cents"] > 0
    )
    amount = expense["debit_cents"] // 2
    expense["debit_cents"] -= amount
    add(
        "journal_lines",
        line_id=max(l["line_id"] for l in t["journal_lines"]) + 1,
        entry_id=entry["entry_id"],
        account_id=4 if expense["account_id"] != 4 else 5,
        debit_cents=amount,
        credit_cents=0,
    )
    for n in range(1, 5):
        add(
            "raw_order_import",
            raw_id=n,
            source_ref="DUP" if n < 3 else None,
            raw_date="bad" if n == 1 else "2025-12-01",
            raw_customer="",
            raw_amount="RM 10",
        )
    # Failed attempts never count as settled cash. Scenario B deliberately omits one receipt posting.
    settled = t["payments"][0]
    add(
        "payments",
        payment_id=len(t["payments"]) + 1,
        order_id=settled["order_id"],
        payment_date=settled["payment_date"],
        amount_cents=settled["amount_cents"],
        status="failed",
    )
    if seed == 202611179:
        first = next(m for m in t["stock_movements"] if m["movement_type"] == "receipt")
        t["stock_movements"] = [
            m for m in t["stock_movements"] if m["movement_id"] != first["movement_id"]
        ]
        another = next(
            m
            for m in t["stock_movements"]
            if m["movement_type"] == "receipt" and m["quantity_delta"] > 1
        )
        amount = another["quantity_delta"] // 2
        another["quantity_delta"] -= amount
        add(
            "stock_movements",
            **dict(
                another,
                movement_id=max(m["movement_id"] for m in t["stock_movements"]) + 1,
                quantity_delta=amount,
            ),
        )
        target = next(
            p
            for p in t["payments"]
            if p["payment_date"] >= "2025-01-01" and p["status"] == "settled"
        )
        target["amount_cents"] += 17
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.create_function(
        "CONCAT", -1, lambda *v: None if None in v else "".join(map(str, v))
    )
    schema = {
        n: s
        for n, s in canonical.execute(
            "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    views = [
        s for s, in canonical.execute("SELECT sql FROM sqlite_master WHERE type='view'")
    ]
    for ddl in schema.values():
        db.execute(ddl)
    for name, rows in t.items():
        if rows:
            cols = list(rows[0])
            db.executemany(
                "INSERT INTO "
                + name
                + " ("
                + ",".join(cols)
                + ") VALUES ("
                + ",".join("?" for _ in cols)
                + ")",
                [[row[c] for c in cols] for row in rows],
            )
    for ddl in views:
        db.execute(ddl)
    db.commit()
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    fixture = {
        "kind": "query",
        "scenarioSeed": seed,
        "scenarioDescription": "独立小型企业，独立主档与业务事件，包含零预算、重复发票、贷项、多次付款、无订单访问与并列排名。场景B第二季度停业，显式模拟漏记一笔收货及多结算17分，仅存在隔离测试场景。",
        "setupSql": ";\n".join(views) + ";",
        "tables": [],
    }
    for name in schema:
        info = db.execute("PRAGMA table_info(" + name + ")").fetchall()
        fixture["tables"].append(
            {
                "name": name,
                "columns": [{"name": row[1], "sqliteType": row[2]} for row in info],
                "rows": [list(row) for row in db.execute("SELECT * FROM " + name)],
            }
        )
    return db, fixture
