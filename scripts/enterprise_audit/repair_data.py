"""Deterministic, evidence-driven repair of the existing enterprise resource copy.
Stable learning IDs and existing entity master/order IDs are retained. No legacy generator runs.
"""

import calendar
import collections as C
import datetime as D
import hashlib
import json
import math
import os
from pathlib import Path
import random
import shutil
import sqlite3
from realism import prepare_masters, campaigns, eligible_promotion, prepare_purchases

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = Path(os.environ.get("SQL_AUDIT_ORIGINAL", ROOT / ".tooling/audit-original/CONTENT"))
CONTENT = ROOT / "resources/CONTENT"
DBREL = Path("question_resource/databases/enterprise/enterprise.sqlite")
OUT = ROOT / "artifacts/enterprise-audit"
OUT.mkdir(parents=True, exist_ok=True)
START = D.date(2023, 1, 1)
END = D.date(2025, 12, 31)
DAYS = [START + D.timedelta(days=i) for i in range((END - START).days + 1)]
MONTHS = sorted({str(d)[:7] for d in DAYS})
MONTHENDS = [
    D.date(int(m[:4]), int(m[5:]), calendar.monthrange(int(m[:4]), int(m[5:]))[1])
    for m in MONTHS
]
SEED = 2026111705


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def connect(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.create_function(
        "CONCAT", -1, lambda *v: "".join(map(str, v)) if None not in v else None
    )
    return db


def stats(db):
    def values(sql):
        return [x[0] for x in db.execute(sql)]

    def dist(v):
        v = sorted(v)
        return dict(
            n=len(v),
            minimum=v[0] if v else None,
            p50=v[len(v) // 2] if v else None,
            p95=v[min(len(v) - 1, int(len(v) * 0.95))] if v else None,
            maximum=v[-1] if v else None,
            mean=sum(v) / len(v) if v else None,
        )

    def rows(sql):
        return [list(x) for x in db.execute(sql)]

    return {
        "monthlySales": rows(
            "SELECT SUBSTR(order_date,1,7),SUM(net_cents) FROM v_sales_lines GROUP BY 1 ORDER BY 1"
        ),
        "storeSales2025": rows(
            "SELECT store_id,SUM(net_cents),ROUND(100.0*SUM(net_cents-cost_cents)/SUM(net_cents),2) FROM v_sales_lines WHERE channel='store' AND order_date>='2025-01-01' GROUP BY store_id ORDER BY 1"
        ),
        "productQuantity": dist(
            values("SELECT SUM(quantity) FROM order_items GROUP BY product_id")
        ),
        "customerFrequency": dist(
            values(
                "SELECT COUNT(*) FROM orders WHERE channel='online' AND status='completed' GROUP BY customer_id"
            )
        ),
        "salaryDecember": dist(
            values("SELECT base_cents FROM salary_history WHERE month_key='2025-12'")
        ),
        "transferTenureDays": dist(
            values(
                "SELECT CAST(julianday(h.start_date)-julianday(e.hire_date) AS INT) FROM employment_history h JOIN employees e USING(employee_id) WHERE h.start_date>e.hire_date"
            )
        ),
        "promotionDays": rows(
            "SELECT promotion_id,start_date,end_date FROM promotions ORDER BY promotion_id"
        ),
        "inventoryOpening": dist(values("SELECT quantity FROM inventory_opening")),
        "movementTypes": rows(
            "SELECT movement_type,COUNT(*) FROM stock_movements GROUP BY 1"
        ),
        "orderStates": rows("SELECT status,COUNT(*) FROM orders GROUP BY 1"),
        "supplierDelivery": rows(
            "SELECT supplier_id,ROUND(100.0*SUM(on_time>=quantity_ordered)/COUNT(*),2),ROUND(100.0*SUM(accepted)/NULLIF(SUM(received),0),2) FROM v_po_lines GROUP BY 1 ORDER BY 1"
        ),
        "duplicateInvoiceGroups": db.execute(
            "SELECT COUNT(*) FROM (SELECT po.supplier_id,i.invoice_no FROM supplier_invoices i JOIN purchase_orders po USING(po_id) GROUP BY po.supplier_id,i.invoice_no HAVING COUNT(*)>1)"
        ).fetchone()[0],
        "overpaidInvoices": db.execute(
            "SELECT COUNT(*) FROM v_invoice_balance WHERE balance_cents<0"
        ).fetchone()[0],
        "bytes": db.execute("PRAGMA page_count").fetchone()[0]
        * db.execute("PRAGMA page_size").fetchone()[0],
    }


def main():
    original = connect(ORIGINAL / DBREL)
    dump(OUT / "before.json", stats(original))
    baseline_tasks = []
    for n in range(1, 51):
        t = json.loads(
            (ORIGINAL / f"enterprise_reference/business_tasks/BP{n:02}.json").read_text()
        )
        baseline_tasks.append(
            {
                "task": t["id"],
                "title": t["title"],
                "requirements": t["requirements"],
                "sql": t["sqliteSql"],
            }
        )
    dump(OUT / "task-review-before.json", baseline_tasks)
    original.close()
    shutil.copy2(ORIGINAL / DBREL, CONTENT / DBREL)
    db = connect(CONTENT / DBREL)
    db.execute("PRAGMA foreign_keys=OFF")
    r = random.Random(SEED)
    tables = {
        name: [dict(x) for x in db.execute("SELECT * FROM " + name)]
        for name, in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    profile = {
        "seed": SEED,
        "stores": {},
        "products": {},
        "customers": {},
        "suppliers": {},
        "employees": {},
    }
    stores = {s["store_id"]: s for s in tables["stores"]}
    for sid in stores:
        profile["stores"][sid] = {
            "scale": r.lognormvariate(0, 0.45),
            "trend": r.uniform(-0.23, 0.35),
            "promoLift": r.uniform(0.08, 0.65),
        }
    popularity, popsum, cost_at = prepare_masters(db, tables, profile, r, START, END)
    promos, scope_stores, scope_categories = campaigns(
        db, tables, profile, r, START, END
    )
    active_promos = {
        str(d): [p for p in promos if p["start_date"] <= str(d) <= p["end_date"]]
        for d in DAYS
    }

    def demand_effect(day, channel, store=None, member_since=None, sensitivity=1):
        effects = [
            p["demand_change_bp"] / 10000
            for p in active_promos[str(day)]
            if p["channel_scope"] in ("all", channel)
            and (p["store_scope"] == "all" or store in scope_stores[p["promotion_id"]])
            and (not p["members_only"] or (member_since and member_since <= str(day)))
        ]
        return max(0.45, 1 + sum(effects) * sensitivity)

    date_distributions = {}
    daily_rng = random.Random(SEED + 101)
    daily_shocks = {}
    shock = 0.0
    for day in DAYS:
        shock = 0.6 * shock + daily_rng.gauss(0, 0.07)
        if daily_rng.random() < 0.015:
            shock += daily_rng.gauss(0, 0.2)
        daily_shocks[str(day)] = math.exp(max(-0.4, min(0.5, shock)))
    profile["dailyDemandFactors"] = daily_shocks

    def season(d, trend=0):
        year = (d - START).days / 365
        holiday = (
            1.45
            if d.month == 12
            else (
                1.30
                if d.month == 11
                else 1.14 if d.month in (1, 6) else 0.86 if d.month in (3, 8) else 1
            )
        )
        weekend = 1.18 if d.weekday() >= 5 else 1
        return holiday * weekend * math.exp(trend * year) * daily_shocks[str(d)]

    def choose_date(first=START, last=END, trend=0.08, promo_lift=0, store=None):
        key = (first, last, trend, promo_lift, store)
        if key not in date_distributions:
            eligible = [d for d in DAYS if first <= d <= last]
            weights = [
                season(d, trend)
                * (
                    demand_effect(d, "store", store, sensitivity=promo_lift)
                    if store
                    else 1
                )
                for d in eligible
            ]
            date_distributions[key] = (eligible, weights)
        eligible, weights = date_distributions[key]
        return r.choices(eligible, weights=weights)[0]

    customer_ids = []
    customer_weights = []
    customer_dates = {}
    for u in tables["customers"]:
        uid = u["customer_id"]
        signup = choose_date(trend=0.18)
        tier = r.choices(
            ["once", "regular", "loyal", "dormant"], [0.43, 0.34, 0.13, 0.10]
        )[0]
        end = END
        if tier in ("once", "dormant") or r.random() < 0.23:
            end = min(END, signup + D.timedelta(days=r.randint(20, 430)))
        power = r.lognormvariate(0, 0.52)
        profile["customers"][uid] = {
            "tier": tier,
            "power": power,
            "activityEnd": str(end),
            "promoSensitivity": r.betavariate(2, 3),
        }
        u["signup_date"] = str(signup)
        u["member_since_date"] = (
            str(min(end, signup + D.timedelta(days=round(r.expovariate(1 / 48)))))
            if r.random()
            < {"once": 0.12, "regular": 0.48, "loyal": 0.88, "dormant": 0.25}[tier]
            else None
        )
        customer_ids.append(uid)
        customer_weights.append(
            {"once": 0.5, "regular": 2, "loyal": 7, "dormant": 0.08}[tier]
            * r.lognormvariate(0, 0.4)
        )
        customer_dates[uid] = (signup, end)
    chosen = r.choices(
        customer_ids, weights=customer_weights, k=len(tables["customer_sessions"])
    )
    session_map = {}
    date_cache = {}
    for session, uid in zip(tables["customer_sessions"], chosen):
        if uid not in date_cache:
            first, last = customer_dates[uid]
            dates = [d for d in DAYS if first <= d <= last]
            date_cache[uid] = (
                dates,
                [
                    season(d, 0.08)
                    * demand_effect(
                        d,
                        "online",
                        member_since=tables["customers"][uid - 1]["member_since_date"],
                        sensitivity=profile["customers"][uid]["promoSensitivity"],
                    )
                    for d in dates
                ],
            )
        dates, weights = date_cache[uid]
        day = r.choices(dates, weights=weights)[0]
        source = r.choices(
            [1, 2, 3, 4, 5],
            weights=[
                38,
                24,
                20,
                12 if profile["customers"][uid]["tier"] == "loyal" else 5,
                8,
            ],
        )[0]
        session.update(customer_id=uid, session_date=str(day), source_id=source)
        session_map[session["session_id"]] = session
    # Conversion odds differ by channel and customer segment. Existing online order IDs are retained.
    online_flags = [r.random() < 0.40 for _ in tables["orders"]]
    selected_sessions = sorted(
        tables["customer_sessions"],
        key=lambda x: r.random()
        / (
            {"loyal": 2.8, "regular": 1.4, "once": 0.9, "dormant": 0.2}[
                profile["customers"][x["customer_id"]]["tier"]
            ]
            * {1: 1.15, 2: 1, 3: 0.7, 4: 1.6, 5: 0.8}[x["source_id"]]
        ),
    )[: sum(online_flags)]
    items_by_order = C.defaultdict(list)
    order_ids = [o["order_id"] for o in tables["orders"]]
    basket_weights = [r.lognormvariate(0, 0.65) for _ in order_ids]
    parents = order_ids + r.choices(
        order_ids, weights=basket_weights, k=len(tables["order_items"]) - len(order_ids)
    )
    r.shuffle(parents)
    for row, order_id in zip(tables["order_items"], parents):
        row["order_id"] = order_id
        items_by_order[order_id].append(row)
    product_ids = list(popularity)
    product_choices = {
        tier: r.choices(
            product_ids,
            weights=[
                popularity[p]
                * math.exp(-profile["products"][p]["price"] / (5000 * (tier + 1)))
                for p in product_ids
            ],
            k=100000,
        )
        for tier in range(4)
    }
    product_index = C.Counter()
    planned = []
    online_index = 0
    for order, online in zip(tables["orders"], online_flags):
        if online:
            session = selected_sessions[online_index]
            online_index += 1
            uid = session["customer_id"]
            day = D.date.fromisoformat(session["session_date"])
            order.update(
                channel="online",
                store_id=None,
                session_id=session["session_id"],
                customer_id=uid,
                order_date=str(day),
            )
            st = None
        else:
            st = r.choices(
                list(stores), weights=[profile["stores"][i]["scale"] for i in stores]
            )[0]
            day = choose_date(
                trend=profile["stores"][st]["trend"],
                promo_lift=profile["stores"][st]["promoLift"],
                store=st,
            )
            uid = r.choice(customer_ids) if r.random() > 0.18 else None
            if uid and str(day) < tables["customers"][uid - 1]["signup_date"]:
                uid = None
            order.update(
                channel="store",
                session_id=None,
                store_id=st,
                order_date=str(day),
                customer_id=uid,
            )
        power = profile["customers"][uid]["power"] if uid else 1
        tier = min(3, max(0, int(power * 1.25)))
        for item in items_by_order[order["order_id"]]:
            pid = product_choices[tier][product_index[tier]]
            product_index[tier] += 1
            p = profile["products"][pid]
            # Discontinued items remain valid historical sales, with no post-discontinuation orders.
            if p["discontinuedDate"] and str(day) >= p["discontinuedDate"]:
                pid = r.choice(
                    [
                        v
                        for v in product_ids
                        if not profile["products"][v]["discontinuedDate"]
                        or str(day) < profile["products"][v]["discontinuedDate"]
                    ]
                )
                p = profile["products"][pid]
            quantity = max(
                1,
                min(
                    12, round(r.lognormvariate(math.log(1.5 * math.sqrt(power)), 0.48))
                ),
            )
            item.update(
                product_id=pid,
                quantity=quantity,
                unit_price_cents=p["price"],
                unit_cost_cents=cost_at(pid, day),
                promotion_id=None,
                discount_cents=0,
            )
        basket = sum(
            i["quantity"] * i["unit_price_cents"]
            for i in items_by_order[order["order_id"]]
        )
        member_since = (
            tables["customers"][uid - 1]["member_since_date"] if uid else None
        )
        for item in items_by_order[order["order_id"]]:
            product = profile["products"][item["product_id"]]
            eligible = [
                p
                for p in active_promos[str(day)]
                if eligible_promotion(
                    p,
                    day,
                    order["channel"],
                    st,
                    product["category"],
                    member_since,
                    basket,
                    scope_stores,
                    scope_categories,
                )
            ]
            sensitivity = profile["customers"][uid]["promoSensitivity"] if uid else 0.3
            selected = (
                r.choices(
                    eligible, weights=[p["discount_basis_points"] for p in eligible]
                )[0]
                if eligible and r.random() < 0.45 + 0.45 * sensitivity
                else None
            )
            gross = item["quantity"] * item["unit_price_cents"]
            if selected:
                item.update(
                    promotion_id=selected["promotion_id"],
                    discount_cents=(gross * selected["discount_basis_points"] + 5000)
                    // 10000,
                )
            elif r.random() < 0.09:
                item["discount_cents"] = round(gross * r.triangular(0.01, 0.08, 0.025))
        order["status"] = r.choices(
            ["completed", "cancelled", "pending"], [0.94, 0.04, 0.02]
        )[0]
        order["cancellation_reason"] = (
            r.choice(["客户取消", "付款超时", "地址无法配送"])
            if order["status"] == "cancelled"
            else None
        )
        planned.append(order)
    # Purchase quantities follow latent forecast demand, not the future minimum inventory balance.
    po_map, pi_map, receipts, credits, ware_share = prepare_purchases(
        db,
        tables,
        profile,
        r,
        START,
        END,
        cost_at,
        choose_date,
        popularity,
        popsum,
        stores,
    )
    # Event-ledger simulation: stock shortages can defer an order, never fabricate opening stock.
    db.executescript(
        """CREATE TABLE supplier_credit_notes(credit_note_id INTEGER PRIMARY KEY,supplier_invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(supplier_invoice_id),credit_date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),reason TEXT NOT NULL);
    CREATE TABLE stock_transfers(transfer_id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(product_id),from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(warehouse_id),to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(warehouse_id),transfer_date TEXT NOT NULL,expected_receipt_date TEXT NOT NULL,received_date TEXT,unit_cost_cents INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),CHECK(from_warehouse_id<>to_warehouse_id));
    CREATE TABLE stock_adjustments(adjustment_id INTEGER PRIMARY KEY,warehouse_id INTEGER NOT NULL REFERENCES warehouses(warehouse_id),product_id INTEGER NOT NULL REFERENCES products(product_id),adjustment_date TEXT NOT NULL,quantity_lost INTEGER NOT NULL CHECK(quantity_lost>0),reason TEXT NOT NULL);
    CREATE TABLE expense_documents(document_id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL UNIQUE REFERENCES journal_entries(entry_id),document_date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),document_type TEXT NOT NULL);
    """
    )
    stock_schema = db.execute(
        "SELECT sql FROM sqlite_master WHERE name='stock_movements'"
    ).fetchone()[0]
    stock_indexes = [
        x[0]
        for x in db.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='stock_movements' AND sql IS NOT NULL"
        )
    ]
    stock_schema = stock_schema.replace(
        "movement_type='sale' AND quantity_delta<0",
        "movement_type IN ('sale','transfer_out','loss') AND quantity_delta<0",
    ).replace("'receipt','return'", "'receipt','return','transfer_in'")
    db.execute("DROP TABLE stock_movements")
    db.execute(stock_schema)
    for ddl in stock_indexes:
        db.execute(ddl)
    db.execute(
        "ALTER TABLE stock_movements ADD COLUMN return_id INTEGER REFERENCES returns(return_id)"
    )
    db.execute(
        "ALTER TABLE stock_movements ADD COLUMN transfer_id INTEGER REFERENCES stock_transfers(transfer_id)"
    )
    db.execute(
        "ALTER TABLE stock_movements ADD COLUMN adjustment_id INTEGER REFERENCES stock_adjustments(adjustment_id)"
    )
    stock = C.Counter()
    opening = []
    movements = []
    transfers = []
    adjustments = []
    returns = []
    payments = []
    snapshots = []
    for w in (1, 2, 3):
        for pid in product_ids:
            daily = 200000 / 1096 * popularity[pid] / popsum * ware_share[w]
            qty = max(
                1,
                round(
                    daily * 60 * r.lognormvariate(0, 0.35)
                    + profile["products"][pid]["safetyDays"] * daily
                ),
            )
            stock[w, pid] = qty
            opening.append(
                dict(
                    opening_id=len(opening) + 1,
                    warehouse_id=w,
                    product_id=pid,
                    quantity=qty,
                )
            )
    events = C.defaultdict(list)
    for row in receipts:
        events[row["receipt_date"]].append(("receipt", row))
    for order in planned:
        events[order["order_date"]].append(("order", order))

    def move(
        w,
        pid,
        day,
        kind,
        qty,
        cost,
        order_item_id=None,
        receipt_id=None,
        return_id=None,
        transfer_id=None,
        adjustment_id=None,
    ):
        stock[w, pid] += qty
        assert stock[w, pid] >= 0
        movements.append(
            dict(
                movement_id=len(movements) + 1,
                warehouse_id=w,
                product_id=pid,
                movement_date=str(day),
                movement_type=kind,
                quantity_delta=qty,
                unit_cost_cents=cost,
                order_item_id=order_item_id,
                receipt_id=receipt_id,
                return_id=return_id,
                transfer_id=transfer_id,
                adjustment_id=adjustment_id,
            )
        )

    return_sequence = 0
    for day in DAYS:
        for kind, row in list(events[str(day)]):
            if kind == "receipt":
                pi = pi_map[row["po_item_id"]]
                po = po_map[pi["po_id"]]
                qty = row["quantity_received"] - row["quantity_rejected"]
                if qty:
                    move(
                        po["warehouse_id"],
                        pi["product_id"],
                        day,
                        "receipt",
                        qty,
                        pi["unit_price_cents"],
                        receipt_id=row["receipt_id"],
                    )
            elif kind == "transfer_in":
                move(
                    row["to_warehouse_id"],
                    row["product_id"],
                    day,
                    "transfer_in",
                    row["quantity"],
                    row["unit_cost_cents"],
                    transfer_id=row["transfer_id"],
                )
            elif kind == "return":
                ret, item, w = row
                returns.append(ret)
                move(
                    w,
                    item["product_id"],
                    day,
                    "return",
                    ret["quantity"],
                    item["unit_cost_cents"],
                    order_item_id=item["order_item_id"],
                    return_id=ret["return_id"],
                )
            else:
                order = row
                if order["status"] != "completed":
                    if r.random() < 0.25:
                        amount = sum(
                            i["quantity"] * i["unit_price_cents"] - i["discount_cents"]
                            for i in items_by_order[order["order_id"]]
                        )
                        payments.append(
                            dict(
                                payment_id=len(payments) + 1,
                                order_id=order["order_id"],
                                payment_date=str(day),
                                amount_cents=amount,
                                status="failed",
                            )
                        )
                    continue
                w = (
                    stores[order["store_id"]]["fulfillment_warehouse_id"]
                    if order["store_id"]
                    else 3
                )
                lines = items_by_order[order["order_id"]]
                needed = C.Counter()
                for item in lines:
                    needed[item["product_id"]] += item["quantity"]
                # Transfers are dispatched now and received after route-dependent transit.
                for pid, qty in needed.items():
                    if stock[w, pid] >= qty:
                        continue
                    candidates = [
                        v
                        for v in (1, 2, 3)
                        if v != w
                        and stock[v, pid]
                        > qty
                        - stock[w, pid]
                        + tables["products"][pid - 1]["reorder_level"]
                    ]
                    if candidates and r.random() < 0.7:
                        source = max(candidates, key=lambda v: stock[v, pid])
                        amount = qty - stock[w, pid]
                        arrival = day + D.timedelta(
                            days=(
                                r.randint(1, 3)
                                if {source, w} == {1, 2}
                                else r.randint(3, 7)
                            )
                        )
                        transfer = dict(
                            transfer_id=len(transfers) + 1,
                            product_id=pid,
                            from_warehouse_id=source,
                            to_warehouse_id=w,
                            transfer_date=str(day),
                            quantity=amount,
                            expected_receipt_date=str(arrival),
                            received_date=str(arrival) if arrival <= END else None,
                            unit_cost_cents=cost_at(pid, day),
                        )
                        transfers.append(transfer)
                        move(
                            source,
                            pid,
                            day,
                            "transfer_out",
                            -amount,
                            cost_at(pid, day),
                            transfer_id=transfer["transfer_id"],
                        )
                        if arrival <= END:
                            events[str(arrival)].append(("transfer_in", transfer))
                if any(stock[w, pid] < qty for pid, qty in needed.items()):
                    order["status"] = "pending"
                    continue
                total = 0
                for item in lines:
                    pid = item["product_id"]
                    net = (
                        item["quantity"] * item["unit_price_cents"]
                        - item["discount_cents"]
                    )
                    total += net
                    move(
                        w,
                        pid,
                        day,
                        "sale",
                        -item["quantity"],
                        item["unit_cost_cents"],
                        order_item_id=item["order_item_id"],
                    )
                    probability = (
                        0.025
                        + 0.10 * profile["products"][pid]["promoSensitivity"]
                        + (0.025 if order["channel"] == "online" else 0)
                    )
                    rd = day + D.timedelta(days=r.randint(2, 27))
                    if r.random() < probability and rd <= END:
                        qty = r.randint(1, item["quantity"])
                        return_sequence += 1
                        ret = dict(
                            return_id=return_sequence,
                            order_item_id=item["order_item_id"],
                            return_date=str(rd),
                            quantity=qty,
                            refund_cents=(2 * net * qty + item["quantity"])
                            // (2 * item["quantity"]),
                        )
                        events[str(rd)].append(("return", (ret, item, w)))
                amounts = (
                    [total]
                    if r.random() > 0.16
                    else [round(total * r.uniform(0.15, 0.85))]
                )
                if len(amounts) == 1 and amounts[0] != total:
                    amounts.append(total - amounts[0])
                if r.random() < 0.06:
                    payments.append(
                        dict(
                            payment_id=len(payments) + 1,
                            order_id=order["order_id"],
                            payment_date=str(day),
                            amount_cents=total,
                            status="failed",
                        )
                    )
                for amount in amounts:
                    payments.append(
                        dict(
                            payment_id=len(payments) + 1,
                            order_id=order["order_id"],
                            payment_date=str(day),
                            amount_cents=amount,
                            status="settled",
                        )
                    )
        if r.random() < 0.35:
            w = r.choice((1, 2, 3))
            pid = r.choices(
                product_ids,
                weights=[
                    max(0, stock[w, v])
                    * (2 if profile["products"][v]["category"] in (4, 5) else 1)
                    for v in product_ids
                ],
            )[0]
            if stock[w, pid] > 0:
                qty = min(
                    stock[w, pid], max(1, round(stock[w, pid] * r.betavariate(1, 40)))
                )
                a = dict(
                    adjustment_id=len(adjustments) + 1,
                    warehouse_id=w,
                    product_id=pid,
                    adjustment_date=str(day),
                    quantity_lost=qty,
                    reason=r.choice(
                        ["盘点损耗", "破损报废"]
                        + (
                            ["过期报废"]
                            if profile["products"][pid]["category"] in (4, 5)
                            else []
                        )
                    ),
                )
                adjustments.append(a)
                move(
                    w,
                    pid,
                    day,
                    "loss",
                    -qty,
                    cost_at(pid, day),
                    adjustment_id=a["adjustment_id"],
                )
        if day in MONTHENDS:
            for w in (1, 2, 3):
                for pid in product_ids:
                    snapshots.append(
                        dict(
                            snapshot_id=len(snapshots) + 1,
                            warehouse_id=w,
                            product_id=pid,
                            snapshot_date=str(day),
                            quantity=stock[w, pid],
                            unit_cost_cents=cost_at(pid, day),
                        )
                    )
    for order in planned:
        if (
            order["status"] == "pending"
            and (END - D.date.fromisoformat(order["order_date"])).days > 30
        ):
            order.update(
                status="cancelled", cancellation_reason="库存不足或待付款超时关闭"
            )
    tables.update(
        inventory_opening=opening,
        stock_movements=movements,
        inventory_snapshots=snapshots,
        stock_transfers=transfers,
        stock_adjustments=adjustments,
        returns=returns,
        payments=payments,
        supplier_credit_notes=credits,
    )
    # Targets are a prior-year planning estimate plus store strategy, never a random multiple of same-year actuals.
    sales_plan = {}
    for row in tables["sales_targets"]:
        sid = row["store_id"]
        month = int(row["month_key"][5:])
        year = int(row["month_key"][:4])
        p = profile["stores"][sid]
        row["target_cents"] = max(
            1,
            round(
                1800000
                * p["scale"]
                * math.exp(p["trend"] * (year - 2023))
                * (1.4 if month in (11, 12) else 1)
                * r.lognormvariate(0, 0.08)
            ),
        )
    # Stable employee effects, annual increments and promotion-linked changes replace monthly salary noise.
    # Department sizes and job grades follow staffing needs rather than employee-ID cycles.
    department_weights = [40, 12, 13, 9, 7, 5, 14]
    for job in tables["employment_history"]:
        dep = r.choices(list(range(1, 8)), department_weights)[0]
        job["department_id"] = dep
        job["position_id"] = r.choices([1, 2, 3, 4, 5], [45, 29, 16, 7, 3])[0]
        job["store_id"] = (
            r.choices(
                list(stores), [profile["stores"][sid]["scale"] for sid in stores]
            )[0]
            if dep == 1
            else None
        )
    histories = []
    salaries = []
    for emp in tables["employees"]:
        hire = choose_date(trend=0.16)
        termination = (
            min(
                END,
                hire
                + D.timedelta(
                    days=max(45, round(r.lognormvariate(math.log(420), 0.65)))
                ),
            )
            if r.random() < 0.22
            else None
        )
        if termination and termination <= hire:
            termination = None
        emp.update(
            hire_date=str(hire),
            termination_date=str(termination) if termination else None,
        )
        end = termination or END + D.timedelta(days=1)
        duration = (end - hire).days
        changing = duration > 90 and r.random() < 1 - math.exp(-duration / 1500)
        split = (
            hire + D.timedelta(days=r.randint(45, duration - 1)) if changing else None
        )
        first_dep = r.choices(list(range(1, 8)), department_weights)[0]
        grade = r.choices([1, 2, 3, 4, 5], [45, 29, 16, 7, 3])[0]
        for first, last in (
            [(hire, split), (split, termination)] if split else [(hire, termination)]
        ):
            dep = (
                first_dep
                if first == hire
                else r.choice([d for d in range(1, 8) if d != first_dep])
            )
            histories.append(
                dict(
                    employment_id=len(histories) + 1,
                    employee_id=emp["employee_id"],
                    department_id=dep,
                    position_id=grade,
                    store_id=(
                        r.choices(
                            list(stores),
                            [profile["stores"][sid]["scale"] for sid in stores],
                        )[0]
                        if dep == 1
                        else None
                    ),
                    start_date=str(first),
                    end_date=str(last) if last else None,
                )
            )
        for month in MONTHS:
            first = D.date.fromisoformat(month + "-01")
            last = D.date(
                first.year, first.month, calendar.monthrange(first.year, first.month)[1]
            )
            if last >= hire and first < end:
                salaries.append(
                    dict(
                        salary_id=len(salaries) + 1,
                        employee_id=emp["employee_id"],
                        employment_id=histories[-1]["employment_id"],
                        month_key=month,
                        base_cents=0,
                        bonus_cents=0,
                    )
                )
    tables["employment_history"] = histories
    tables["salary_history"] = salaries
    employment_by_employee = C.defaultdict(list)
    for h in tables["employment_history"]:
        employment_by_employee[h["employee_id"]].append(h)
    empmap = {e["employee_id"]: e for e in tables["employees"]}
    for eid, hist in employment_by_employee.items():
        hist.sort(key=lambda h: h["start_date"])
        emp = empmap[eid]
        hire = D.date.fromisoformat(emp["hire_date"])
        end = (
            D.date.fromisoformat(emp["termination_date"])
            if emp["termination_date"]
            else END + D.timedelta(days=1)
        )
        if len(hist) > 1:
            transfer = hire + D.timedelta(
                days=r.randint(45, max(45, (end - hire).days - 1))
            )
            hist[0]["end_date"] = str(transfer)
            hist[1]["start_date"] = str(transfer)
            hist[1]["position_id"] = (
                hist[0]["position_id"]
                if r.random() < 0.57
                else min(5, hist[0]["position_id"] + 1)
            )
        profile["employees"][eid] = {
            "payFactor": r.lognormvariate(0, 0.13),
            "overtimeFactor": r.betavariate(2, 5),
            "raise": r.uniform(0.025, 0.065),
        }
    for row in tables["salary_history"]:
        eid = row["employee_id"]
        emp = empmap[eid]
        month = row["month_key"]
        end = min(
            D.date(
                int(month[:4]),
                int(month[5:]),
                calendar.monthrange(int(month[:4]), int(month[5:]))[1],
            ),
            (
                D.date.fromisoformat(emp["termination_date"]) - D.timedelta(days=1)
                if emp["termination_date"]
                else END
            ),
        )
        hist = employment_by_employee[eid]
        job = next(
            h
            for h in hist
            if h["start_date"] <= str(end)
            and (h["end_date"] is None or h["end_date"] > str(end))
        )
        first = max(
            D.date.fromisoformat(emp["hire_date"]),
            D.date(int(month[:4]), int(month[5:]), 1),
        )
        fraction = (end - first).days + 1
        fraction /= calendar.monthrange(int(month[:4]), int(month[5:]))[1]
        p = profile["employees"][eid]
        full = (
            (140000 + job["position_id"] * 75000)
            * p["payFactor"]
            * (1 + p["raise"]) ** (int(month[:4]) - 2023)
        )
        row.update(
            employment_id=job["employment_id"],
            base_cents=round(full * fraction),
            bonus_cents=round(full * r.uniform(0.05, 0.2)) if r.random() < 0.15 else 0,
        )
    attendance = []
    for eid, emp in empmap.items():
        day = max(START, D.date.fromisoformat(emp["hire_date"]))
        last = (
            min(
                END, D.date.fromisoformat(emp["termination_date"]) - D.timedelta(days=1)
            )
            if emp["termination_date"]
            else END
        )
        rest_day = r.randrange(7)
        reliability = r.betavariate(30, 2)
        while day <= last:
            job = next(
                h
                for h in employment_by_employee[eid]
                if h["start_date"] <= str(day)
                and (h["end_date"] is None or h["end_date"] > str(day))
            )
            operational = job["department_id"] in (1, 3, 7)
            scheduled = day.weekday() != rest_day if operational else day.weekday() < 5
            if r.random() < 0.025:
                scheduled = not scheduled
            if scheduled:
                status = (
                    "present"
                    if r.random() < reliability
                    else r.choices(["leave", "absent"], [0.84, 0.16])[0]
                )
                overtime = (
                    max(15, round(r.lognormvariate(math.log(55), 0.45) / 15) * 15)
                    if status == "present"
                    and r.random()
                    < profile["employees"][eid]["overtimeFactor"]
                    * (1.4 if day.month in (11, 12) else 1)
                    else 0
                )
                attendance.append(
                    dict(
                        attendance_id=len(attendance) + 1,
                        employee_id=eid,
                        attendance_date=str(day),
                        status=status,
                        work_minutes=480 if status == "present" else 0,
                        overtime_minutes=min(240, overtime),
                    )
                )
            day += D.timedelta(days=1)
    tables["attendance"] = attendance
    # Expense documents are the explicit source for the balanced expense journals.
    lines_by_entry = C.defaultdict(list)
    for line in tables["journal_lines"]:
        lines_by_entry[line["entry_id"]].append(line)
    documents = []
    bank = []
    dep_scale = {1: 2.5, 2: 1.2, 3: 0.8, 4: 1.4, 5: 0.6, 6: 0.4, 7: 1.1}
    for entry in tables["journal_entries"]:
        day = choose_date(trend=0.06)
        entry["entry_date"] = str(day)
        lines = lines_by_entry[entry["entry_id"]]
        expense = next(x for x in lines if x["debit_cents"] > 0)
        entry["department_id"] = r.choices(list(dep_scale), list(dep_scale.values()))[0]
        account = r.choices([1, 2, 3, 4, 5], [12, 24, 17, 31, 16])[0]
        expense["account_id"] = account
        scale = dep_scale[entry["department_id"]]
        amount = max(
            100,
            round(
                r.lognormvariate(
                    math.log(
                        {1: 180000, 2: 35000, 3: 65000, 4: 18000, 5: 48000}[account]
                        * scale
                    ),
                    0.45 if account == 1 else 0.85,
                )
            ),
        )
        expense["debit_cents"] = amount
        next(x for x in lines if x["credit_cents"] > 0)["credit_cents"] = amount
        documents.append(
            dict(
                document_id=len(documents) + 1,
                entry_id=entry["entry_id"],
                document_date=str(day),
                amount_cents=amount,
                document_type={
                    1: "租赁账单",
                    2: "水电账单",
                    3: "营销费用单",
                    4: "行政报销单",
                    5: "物流账单",
                }[account],
            )
        )
        # Settlement is event-based. Some documents remain unpaid, some settle in parts or cross periods.
        if r.random() < (0.97 if account in (1, 2) else 0.91):
            payment_day = day + D.timedelta(
                days=max(
                    0,
                    round(
                        r.lognormvariate(math.log(5 if account in (1, 2) else 13), 0.7)
                    ),
                )
            )
            count = 2 if r.random() < 0.08 else 1
            remaining = amount
            for part in range(count):
                if payment_day <= END:
                    paid = (
                        remaining
                        if part == count - 1
                        else round(remaining * r.uniform(0.25, 0.75))
                    )
                    remaining -= paid
                    mismatch = r.randint(30, 1500) if r.random() < 0.015 else 0
                    bank.append(
                        dict(
                            bank_id=len(bank) + 1,
                            transaction_date=str(payment_day),
                            reference_no=entry["reference_no"],
                            amount_cents=-paid + mismatch,
                        )
                    )
                payment_day += D.timedelta(days=r.randint(2, 21))
    day = START + D.timedelta(days=r.randint(1, 10))
    while day <= END:
        bank.append(
            dict(
                bank_id=len(bank) + 1,
                transaction_date=str(day),
                reference_no=(
                    None if r.random() < 0.6 else f"BANK-{r.getrandbits(32):08X}"
                ),
                amount_cents=-max(50, round(r.lognormvariate(math.log(1200), 0.8))),
            )
        )
        day += D.timedelta(days=max(1, round(r.expovariate(1 / 9))))
    tables["bank_transactions"] = bank
    for row in tables["budgets"]:
        row["budget_cents"] = max(
            1,
            round(
                {1: 180000, 2: 35000, 3: 65000, 4: 18000, 5: 48000}[row["account_id"]]
                * dep_scale[row["department_id"]]
                * 14
                * r.lognormvariate(0, 0.15)
            ),
        )
    # This table is a channel-month spending ledger, not one monthly promotion per channel.
    active_months = {
        source: set(r.sample(MONTHS, r.randint(20, 34))) for source in (2, 3, 4, 5)
    }
    for row in tables["marketing_campaigns"]:
        source = row["source_id"]
        row["spend_cents"] = (
            0
            if source == 1 or row["month_key"] not in active_months[source]
            else round(
                {2: 260000, 3: 200000, 4: 80000, 5: 120000}[source]
                * (1.6 if row["month_key"][5:] in ("11", "12") else 1)
                * r.lognormvariate(0, 0.38)
            )
        )
    # Dirty imports are deliberately isolated, with irregular duplicate and malformed positions.
    raw = tables["raw_order_import"]
    previous_refs = []
    for row in raw:
        day = choose_date(first=D.date(2025, 1, 1))
        format_kind = r.choices(["iso", "dmy", "missing", "invalid"], [52, 31, 11, 6])[
            0
        ]
        raw_date = (
            str(day)
            if format_kind == "iso"
            else (
                day.strftime("%d/%m/%Y")
                if format_kind == "dmy"
                else (
                    None
                    if format_kind == "missing"
                    else r.choice(["2025-02-30", "无法识别", "31/13/2025"])
                )
            )
        )
        amount = max(1, round(r.lognormvariate(math.log(12500), 0.9))) / 100
        amount_kind = r.choices(
            ["decimal", "thousands", "currency", "missing", "invalid"],
            [45, 24, 12, 11, 8],
        )[0]
        raw_amount = (
            f"{amount:.2f}"
            if amount_kind == "decimal"
            else (
                f"{amount:,.2f}"
                if amount_kind == "thousands"
                else (
                    f"RM {amount:.2f}"
                    if amount_kind == "currency"
                    else None if amount_kind == "missing" else "待核对"
                )
            )
        )
        ref = (
            r.choice(previous_refs)
            if previous_refs and r.random() < 0.10
            else f"EXT-{r.getrandbits(40):010X}"
        )
        row.update(
            source_ref=ref,
            raw_date=raw_date,
            raw_customer=(
                None
                if r.random() < 0.18
                else r.choice(tables["customers"])["customer_name"]
            ),
            raw_amount=raw_amount,
        )
        previous_refs.append(ref)
    tables["expense_documents"] = documents
    # One transaction publishes all related records together in the resource copy.
    for name, rows in tables.items():
        db.execute("DELETE FROM " + name)
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
                [[row[k] for k in cols] for row in rows],
            )
    # Credits adjust the payable, while invoice face amount remains available in the source table.
    view = db.execute(
        "SELECT sql FROM sqlite_master WHERE name='v_invoice_balance'"
    ).fetchone()[0]
    view = view.replace(
        "b.billed_cents,COALESCE(a.paid_cents,0)",
        "b.billed_cents-COALESCE(cr.credit_cents,0) billed_cents,COALESCE(a.paid_cents,0)",
    )
    view = view.replace(
        "b.billed_cents-COALESCE(a.paid_cents,0)",
        "b.billed_cents-COALESCE(cr.credit_cents,0)-COALESCE(a.paid_cents,0)",
    )
    view = view.replace(
        "WHERE i.invoice_date<=",
        "LEFT JOIN (SELECT supplier_invoice_id,SUM(amount_cents) credit_cents FROM supplier_credit_notes WHERE credit_date<='2025-12-31' GROUP BY supplier_invoice_id) cr ON cr.supplier_invoice_id=i.supplier_invoice_id WHERE i.invoice_date<=",
    )
    db.execute("DROP VIEW v_invoice_balance")
    db.execute(view)
    view = db.execute(
        "SELECT sql FROM sqlite_master WHERE name='v_po_lines'"
    ).fetchone()[0]
    view = view.replace(
        "WHERE p.status<>'cancelled'",
        "WHERE p.status<>'cancelled' AND p.order_date<='2025-12-31'",
    )
    db.execute("DROP VIEW v_po_lines")
    db.execute(view)
    for table, col in [
        ("supplier_credit_notes", "supplier_invoice_id"),
        ("stock_transfers", "product_id"),
        ("stock_adjustments", "product_id"),
        ("expense_documents", "entry_id"),
    ]:
        db.execute(f"CREATE INDEX ix_{table}_{col} ON {table}({col})")
    db.commit()
    db.execute("PRAGMA foreign_keys=ON")
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.execute("VACUUM")
    dump(OUT / "after.json", stats(db))
    dump(
        CONTENT / "enterprise_reference/structured_data/simulation_profiles.json",
        profile,
    )
    db.close()
    print("Repaired canonical data with seed", SEED, flush=True)


if __name__ == "__main__":
    main()
