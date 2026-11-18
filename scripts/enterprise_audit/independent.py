"""Independent business computations from raw facts, without executing task SQL or views."""

from collections import defaultdict, Counter
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import mean
import calendar

CUTOFF = "2025-12-31"


def groups(rows, key):
    result = defaultdict(list)
    for row in rows:
        result[key(row)].append(row)
    return result


def total(rows, key):
    return sum(row[key] for row in rows)


def div(a, b):
    return a / b if a is not None and b not in (0, None) else None


def rounded(v, n=2):
    return (
        float(Decimal(str(v)).quantize(Decimal(1).scaleb(-n), rounding=ROUND_HALF_UP))
        if v is not None
        else None
    )


def ratio(a, b, n=2):
    return rounded(div(100 * a, b), n)


def monthadd(month, offset):
    index = int(month[:4]) * 12 + int(month[5:]) - 1 + offset
    return f"{index//12:04}-{index%12+1:02}"


def monthend(m):
    return f"{m}-{calendar.monthrange(int(m[:4]),int(m[5:]))[1]:02}"


def quarter(d):
    return d[:4] + "-Q" + str((int(d[5:7]) - 1) // 3 + 1)


def ntile(rows, key, n=5):
    values = sorted(rows, key=key)
    q, r = divmod(len(values), n)
    out = {}
    for i, row in enumerate(values):
        bucket = i // (q + 1) + 1 if i < (q + 1) * r else r + (i - (q + 1) * r) // q + 1
        out[row["id"]] = bucket
    return out


class Model:
    def __init__(self, db):
        self.t = defaultdict(
            list,
            {
                name: [dict(row) for row in db.execute("SELECT * FROM " + name)]
                for name, in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            },
        )
        t = self.t
        self.products = {p["product_id"]: p for p in t["products"]}
        self.orders = {o["order_id"]: o for o in t["orders"]}
        self.sessions = {s["session_id"]: s for s in t["customer_sessions"]}
        self.sales = []
        returns = groups(
            [r for r in t["returns"] if r["return_date"] <= CUTOFF],
            lambda r: r["order_item_id"],
        )
        for item in t["order_items"]:
            order = self.orders[item["order_id"]]
            if order["status"] != "completed" or order["order_date"] > CUTOFF:
                continue
            ret = returns[item["order_item_id"]]
            qty = item["quantity"] - total(ret, "quantity")
            self.sales.append(
                dict(
                    item,
                    **{
                        k: order[k]
                        for k in [
                            "store_id",
                            "customer_id",
                            "session_id",
                            "channel",
                            "order_date",
                        ]
                    },
                    net_qty=qty,
                    net_cents=item["quantity"] * item["unit_price_cents"]
                    - item["discount_cents"]
                    - total(ret, "refund_cents"),
                    cost_cents=qty * item["unit_cost_cents"],
                    refund_cents=total(ret, "refund_cents"),
                )
            )
        self.net = []
        for oid, items in groups(self.sales, lambda r: r["order_id"]).items():
            self.net.append(
                dict(
                    self.orders[oid],
                    net_cents=total(items, "net_cents"),
                    cost_cents=total(items, "cost_cents"),
                )
            )
        self.po = []
        pomap = {p["po_id"]: p for p in t["purchase_orders"]}
        rg = groups(
            [g for g in t["goods_receipts"] if g["receipt_date"] <= CUTOFF],
            lambda r: r["po_item_id"],
        )
        bg = groups(t["supplier_invoice_items"], lambda r: r["po_item_id"])
        for item in t["purchase_order_items"]:
            p = pomap[item["po_id"]]
            if p["status"] == "cancelled" or p["order_date"] > CUTOFF:
                continue
            rec = rg[item["po_item_id"]]
            b = bg[item["po_item_id"]]
            self.po.append(
                dict(
                    item,
                    **{
                        k: p[k]
                        for k in [
                            "supplier_id",
                            "warehouse_id",
                            "order_date",
                            "promised_date",
                        ]
                    },
                    received=total(rec, "quantity_received"),
                    accepted=sum(
                        g["quantity_received"] - g["quantity_rejected"] for g in rec
                    ),
                    on_time=sum(
                        g["quantity_received"] - g["quantity_rejected"]
                        for g in rec
                        if g["receipt_date"] <= p["promised_date"]
                    ),
                    billed=total(b, "quantity_billed"),
                    billed_cents=sum(
                        x["quantity_billed"] * x["unit_price_cents"] for x in b
                    ),
                    ordered_cents=item["quantity_ordered"] * item["unit_price_cents"],
                )
            )
        bills = groups(t["supplier_invoice_items"], lambda r: r["supplier_invoice_id"])
        pay = groups(
            [r for r in t["supplier_payments"] if r["payment_date"] <= CUTOFF],
            lambda r: r["supplier_invoice_id"],
        )
        cr = groups(
            [
                r
                for r in t.get("supplier_credit_notes", [])
                if r["credit_date"] <= CUTOFF
            ],
            lambda r: r["supplier_invoice_id"],
        )
        self.invoices = []
        for invoice in t["supplier_invoices"]:
            iid = invoice["supplier_invoice_id"]
            if invoice["invoice_date"] > CUTOFF or not bills[iid]:
                continue
            billed = sum(
                x["quantity_billed"] * x["unit_price_cents"] for x in bills[iid]
            ) - total(cr[iid], "amount_cents")
            paid = total(pay[iid], "amount_cents")
            self.invoices.append(
                dict(
                    invoice,
                    supplier_id=pomap[invoice["po_id"]]["supplier_id"],
                    billed_cents=billed,
                    paid_cents=paid,
                    balance_cents=billed - paid,
                )
            )
        entries = {e["entry_id"]: e for e in t["journal_entries"]}
        accounts = {a["account_id"]: a for a in t["accounts"]}
        self.expenses = [
            dict(
                entries[l["entry_id"]],
                account_id=l["account_id"],
                expense_cents=l["debit_cents"] - l["credit_cents"],
            )
            for l in t["journal_lines"]
            if accounts[l["account_id"]]["account_type"] == "expense"
        ]
        jobs = {h["employment_id"]: h for h in t["employment_history"]}
        attendance = groups(
            t["attendance"], lambda a: (a["employee_id"], a["attendance_date"][:7])
        )
        self.staff = []
        for salary in t["salary_history"]:
            att = attendance[salary["employee_id"], salary["month_key"]]
            ot = total(att, "overtime_minutes")
            work = total(att, "work_minutes")
            job = jobs[salary["employment_id"]]
            labor = (
                salary["base_cents"]
                + salary["bonus_cents"]
                + rounded(salary["base_cents"] * 1.5 * ot / 10560, 0)
            )
            self.staff.append(
                dict(
                    salary,
                    department_id=job["department_id"],
                    position_id=job["position_id"],
                    store_id=job["store_id"],
                    overtime_minutes=ot,
                    worked_minutes=work,
                    labor_cents=labor,
                )
            )
        self.s25 = [s for s in self.sales if s["order_date"] >= "2025-01-01"]
        self.online = [o for o in self.net if o["channel"] == "online"]
        self.n25 = [o for o in self.online if o["order_date"] >= "2025-01-01"]
        self.exp25 = [
            e for e in self.expenses if "2025-01-01" <= e["entry_date"] <= CUTOFF
        ]
        self.snap = {
            (i["warehouse_id"], i["product_id"]): i
            for i in t["inventory_snapshots"]
            if i["snapshot_date"] == CUTOFF
        }
        self.sold30 = Counter()
        self.sold90 = Counter()
        for m in t["stock_movements"]:
            if m["movement_type"] == "sale" and m["movement_date"] <= CUTOFF:
                key = (m["warehouse_id"], m["product_id"])
                if m["movement_date"] >= "2025-12-02":
                    self.sold30[key] -= m["quantity_delta"]
                if m["movement_date"] >= "2025-10-03":
                    self.sold90[key] -= m["quantity_delta"]
        self.months = sorted(
            {d["month_key"] for d in t["calendar_days"] if d["day"] <= CUTOFF}
        )
        self.m25 = [m for m in self.months if m >= "2025-01"]
        self.stores = sorted(s["store_id"] for s in t["stores"])
        self.suppliers = sorted(s["supplier_id"] for s in t["suppliers"])
        self.departments = sorted(s["department_id"] for s in t["departments"])

    def average_inventory(self, warehouse=None):
        values = defaultdict(int)
        count = Counter()
        required = Counter()
        warehouses = (
            [warehouse]
            if warehouse
            else [w["warehouse_id"] for w in self.t["warehouses"]]
        )
        for p in self.products.values():
            required[p["category_id"]] += 2 * len(warehouses)
        for i in self.t["inventory_snapshots"]:
            if i["warehouse_id"] in warehouses and i["snapshot_date"] in (
                "2024-12-31",
                CUTOFF,
            ):
                cat = self.products[i["product_id"]]["category_id"]
                values[cat] += i["quantity"] * i["unit_cost_cents"]
                count[cat] += 1
        return {
            cat: values[cat] / 2 if count[cat] == needed else None
            for cat, needed in required.items()
        }

    def headcount(self, field, ids, day):
        result = Counter({k: 0 for k in ids})
        for h in self.t["employment_history"]:
            if (
                h[field] in result
                and h["start_date"] <= day
                and (not h["end_date"] or h["end_date"] > day)
            ):
                result[h[field]] += 1
        return result

    def result(self, n):
        from reaudit_metrics import REVISED, result

        if n in REVISED:
            return result(self, n)
        return self._standard_result(n)

    def _standard_result(self, n):
        t = self.t
        out = []
        sg = groups(
            [s for s in self.s25 if s["channel"] == "store"], lambda s: s["store_id"]
        )
        if n == 1:
            targets = groups(
                [
                    x
                    for x in t["sales_targets"]
                    if "2025-01" <= x["month_key"] <= "2025-12"
                ],
                lambda x: x["store_id"],
            )
            for sid in self.stores:
                rows = sg[sid]
                net = total(rows, "net_cents")
                gross = net - total(rows, "cost_cents")
                target = total(targets[sid], "target_cents") if targets[sid] else None
                out.append(
                    [sid, net, gross, ratio(gross, net), target, ratio(net, target)]
                )
        elif n == 2:
            monthly = Counter()
            for s in self.sales:
                if s["channel"] == "store":
                    monthly[s["store_id"], s["order_date"][:7]] += s["net_cents"]
            for sid in self.stores:
                for m in self.m25:
                    net = monthly[sid, m]
                    prev = monthly[sid, monthadd(m, -1)]
                    year = monthly[sid, monthadd(m, -12)]
                    falling = all(
                        monthly[sid, monthadd(m, -k - 1)] > 0
                        and monthly[sid, monthadd(m, -k)]
                        < monthly[sid, monthadd(m, -k - 1)]
                        for k in range(3)
                    )
                    out.append(
                        [
                            sid,
                            m,
                            net,
                            ratio(net - prev, prev),
                            ratio(net - year, year),
                            int(falling),
                        ]
                    )
        elif n == 4:
            days = groups(
                [d for d in t["calendar_days"] if "2025-01-01" <= d["day"] <= CUTOFF],
                lambda d: int(
                    any(
                        p["start_date"] <= d["day"] <= p["end_date"]
                        and p.get("channel_scope", "all") in ("all", "store")
                        for p in t["promotions"]
                    )
                ),
            )
            sales = groups(
                [s for s in self.s25 if s["channel"] == "store"],
                lambda s: s["order_date"],
            )
            for promo, ds in sorted(days.items()):
                rows = [s for d in ds for s in sales[d["day"]]]
                net = total(rows, "net_cents")
                cost = total(rows, "cost_cents")
                out.append(
                    [
                        promo,
                        len(ds),
                        rounded(net / len(ds)),
                        rounded(total(rows, "net_qty") / len(ds)),
                        ratio(net - cost, net),
                    ]
                )
        elif n in (6, 31, 33, 35):
            if n == 6:
                for key, i in self.snap.items():
                    sold = self.sold90[key]
                    value = i["quantity"] * i["unit_cost_cents"]
                    if self.products[key[1]]["active"] and value > 500000 and sold < 20:
                        out.append(
                            [
                                *key,
                                i["quantity"],
                                sold,
                                value,
                                rounded(div(90 * i["quantity"], sold)),
                            ]
                        )
                out.sort(key=lambda r: (-r[4], r[0], r[1]))
            if n == 31:
                for key, i in self.snap.items():
                    sold = self.sold30[key]
                    value = i["quantity"] * i["unit_cost_cents"]
                    fast = sold >= 30 and i["quantity"] < sold * 0.5
                    if self.products[key[1]]["active"] and (
                        fast or (sold <= 3 and value >= 300000)
                    ):
                        out.append(
                            [
                                *key,
                                i["quantity"],
                                sold,
                                value,
                                "fast_shortage" if fast else "slow_excess",
                            ]
                        )
                out.sort(key=lambda r: (r[5], -r[4], r[0], r[1]))
            if n == 33:
                for (w, p), i in self.snap.items():
                    surplus = i["quantity"] - 2 * self.sold30[w, p]
                    if not self.products[p]["active"] or surplus < 10:
                        continue
                    for (v, q), j in self.snap.items():
                        if v != w and p == q and self.sold30[v, p] > j["quantity"]:
                            out.append(
                                [
                                    p,
                                    w,
                                    v,
                                    min(surplus, self.sold30[v, p] - j["quantity"]),
                                ]
                            )
                out.sort()
            if n == 35:
                late = Counter()
                for p in self.po:
                    if (
                        p["promised_date"] <= CUTOFF
                        and p["accepted"] < p["quantity_ordered"]
                    ):
                        late[p["warehouse_id"], p["product_id"]] += (
                            p["quantity_ordered"] - p["accepted"]
                        )
                for key, i in self.snap.items():
                    if late[key] > 0 and i["quantity"] < self.sold30[key]:
                        out.append(
                            [
                                *key,
                                i["quantity"],
                                self.sold30[key],
                                late[key],
                                self.sold30[key] - i["quantity"],
                            ]
                        )
                out.sort(key=lambda r: (-r[-1], r[0], r[1]))
        elif n == 7:
            cogs = Counter()
            for m in t["stock_movements"]:
                if "2025-01-01" <= m["movement_date"] <= CUTOFF and m[
                    "movement_type"
                ] in ("sale", "return"):
                    cogs[
                        m["warehouse_id"], self.products[m["product_id"]]["category_id"]
                    ] -= (m["quantity_delta"] * m["unit_cost_cents"])
            for w in sorted(x["warehouse_id"] for x in t["warehouses"]):
                avg = self.average_inventory(w)
                for cat in sorted(c["category_id"] for c in t["categories"]):
                    co = cogs[w, cat]
                    value = avg.get(cat)
                    out.append(
                        [
                            w,
                            cat,
                            co,
                            value,
                            rounded(div(co, value), 4),
                            (
                                rounded(div(365 * value, co))
                                if value is not None and co > 0
                                else None
                            ),
                        ]
                    )
        elif n == 9:
            batches = defaultdict(list)
            consumed = Counter()
            for i in t["inventory_opening"]:
                batches[i["warehouse_id"], i["product_id"]].append(
                    ("2023-01-01", 0, i["quantity"])
                )
            for m in t["stock_movements"]:
                key = m["warehouse_id"], m["product_id"]
                if m["movement_date"] > CUTOFF:
                    continue
                if m["quantity_delta"] > 0:
                    batches[key].append(
                        (m["movement_date"], m["movement_id"], m["quantity_delta"])
                    )
                else:
                    consumed[key] -= m["quantity_delta"]
            for key, bs in batches.items():
                used = consumed[key]
                aged = remain = 0
                for day, _, qty in sorted(bs):
                    take = min(used, qty)
                    used -= take
                    left = qty - take
                    remain += left
                    if day <= "2025-07-04":
                        aged += left
                if aged and key in self.snap:
                    out.append(
                        [
                            *key,
                            aged,
                            aged * self.snap[key]["unit_cost_cents"],
                            ratio(aged, remain),
                        ]
                    )
            out.sort(key=lambda r: (-r[3], r[0], r[1]))
        elif n == 11:
            segments = defaultdict(list)
            for uid, orders in groups(self.online, lambda o: o["customer_id"]).items():
                for k, o in enumerate(
                    sorted(orders, key=lambda o: (o["order_date"], o["order_id"]))
                ):
                    if o["order_date"] >= "2025-01-01":
                        segments["new" if k == 0 else "returning"].append(o)
            for segment, rows in sorted(segments.items()):
                out.append(
                    [
                        segment,
                        len({r["customer_id"] for r in rows}),
                        len(rows),
                        total(rows, "net_cents"),
                        rounded(total(rows, "net_cents") / len(rows)),
                    ]
                )
        elif n == 13:
            customer = groups(self.online, lambda r: r["customer_id"])
            cohorts = defaultdict(list)
            for uid, rows in customer.items():
                cohorts[min(o["order_date"][:7] for o in rows)].append(uid)
            for cohort, uids in sorted(cohorts.items()):
                for k in range(7):
                    m = monthadd(cohort, k)
                    if m not in self.months:
                        continue
                    active = sum(
                        any(o["order_date"].startswith(m) for o in customer[u])
                        for u in uids
                    )
                    out.append([cohort, k, len(uids), active, ratio(active, len(uids))])
        elif n in (16, 17, 18, 19):
            if n == 16:
                budget = groups(
                    [
                        b
                        for b in t["budgets"]
                        if "2025-01" <= b["month_key"] <= "2025-12"
                    ],
                    lambda b: (b["department_id"], b["account_id"]),
                )
                actual = groups(
                    self.exp25, lambda b: (b["department_id"], b["account_id"])
                )
                for key, rows in sorted(budget.items()):
                    b = total(rows, "budget_cents")
                    a = total(actual[key], "expense_cents")
                    out.append([*key, b, a, a - b, ratio(a - b, b), int(a > b * 1.1)])
            if n == 17:
                for invoice in self.invoices:
                    paid = invoice["paid_cents"]
                    balance = invoice["balance_cents"]
                    status = "overpaid"
                    if balance == 0:
                        status = "paid"
                    elif not paid:
                        status = "unpaid"
                    elif balance > 0:
                        status = "partial"
                    out.append(
                        [
                            invoice["supplier_invoice_id"],
                            invoice["supplier_id"],
                            invoice["billed_cents"],
                            paid,
                            balance,
                            status,
                        ]
                    )
                out.sort(key=lambda row: (-row[4], row[0]))
            if n == 18:
                g = defaultdict(list)
                for i in self.invoices:
                    if i["balance_cents"] <= 0:
                        continue
                    age = (
                        date.fromisoformat(CUTOFF) - date.fromisoformat(i["due_date"])
                    ).days
                    bucket = (
                        "current"
                        if age <= 0
                        else (
                            "01-30"
                            if age <= 30
                            else (
                                "31-60"
                                if age <= 60
                                else "61-90" if age <= 90 else "90+"
                            )
                        )
                    )
                    g[i["supplier_id"], bucket].append(i)
                for key, rows in sorted(g.items()):
                    out.append([*key, len(rows), total(rows, "balance_cents")])
            if n == 19:
                ledger = Counter()
                bank = Counter()
                for e in self.exp25:
                    ledger[e["reference_no"]] += e["expense_cents"]
                for b in t["bank_transactions"]:
                    if "2025-01-01" <= b["transaction_date"] <= CUTOFF:
                        bank[
                            (
                                b["reference_no"]
                                if b["reference_no"] is not None
                                else "BANK-" + str(b["bank_id"])
                            )
                        ] -= b["amount_cents"]
                for ref in sorted(set(ledger) | set(bank)):
                    if ref not in ledger or ref not in bank or ledger[ref] != bank[ref]:
                        out.append(
                            [
                                ref,
                                ledger.get(ref),
                                bank.get(ref),
                                bank[ref] - ledger[ref],
                                (
                                    "bank_only"
                                    if ref not in ledger
                                    else (
                                        "ledger_only"
                                        if ref not in bank
                                        else "difference"
                                    )
                                ),
                            ]
                        )
        elif n in (21, 22, 48):
            field = "store_id" if n == 48 else "department_id"
            ids = self.stores if n == 48 else self.departments
            frame = ["2024-11", "2024-12"] + self.m25 if n == 22 else self.m25
            hc = {
                m: self.headcount(field, ids, monthend(m))
                for m in [monthadd(frame[0], -1)] + frame
            }
            sales = Counter()
            for row in self.sales:
                if row["channel"] == "store":
                    sales[row["store_id"], row["order_date"][:7]] += row["net_cents"]
            exits = Counter()
            emp = {e["employee_id"]: e for e in t["employees"]}
            for h in t["employment_history"]:
                term = emp[h["employee_id"]]["termination_date"]
                if term and h["end_date"] == term:
                    exits[h["department_id"], term[:7]] += 1
            for key in ids:
                averages = []
                leavers = []
                for j, m in enumerate(frame):
                    prev = monthadd(m, -1)
                    opening = hc[prev][key]
                    closing = hc[m][key]
                    if n == 21:
                        out.append([key, m, closing, closing - opening])
                    if n == 22:
                        avg = (opening + closing) / 2
                        e = exits[key, m]
                        averages.append(avg)
                        leavers.append(e)
                        if m < "2025-01":
                            continue
                        out.append(
                            [
                                key,
                                m,
                                opening,
                                closing,
                                e,
                                ratio(e, avg),
                                (
                                    ratio(sum(leavers[-3:]), sum(averages[-3:]))
                                    if j >= 2
                                    else None
                                ),
                            ]
                        )
                    if n == 48:
                        net = sales[key, m]
                        prior = sales[key, prev]
                        out.append(
                            [
                                key,
                                m,
                                closing,
                                net,
                                ratio(closing - opening, opening),
                                ratio(net - prior, prior),
                                int(closing > opening and net < prior),
                            ]
                        )
        elif n == 24:
            for key, rows in sorted(
                groups(
                    [h for h in self.staff if "2025-10" <= h["month_key"] <= "2025-12"],
                    lambda h: (h["department_id"], h["month_key"]),
                ).items()
            ):
                labor = total(rows, "labor_cents")
                minutes = total(rows, "worked_minutes") + total(
                    rows, "overtime_minutes"
                )
                out.append(
                    [
                        *key,
                        total(rows, "base_cents"),
                        total(rows, "bonus_cents"),
                        total(rows, "overtime_minutes"),
                        labor,
                        rounded(div(60 * labor, minutes)),
                    ]
                )
        elif n in (27, 28, 29, 30):
            due = [p for p in self.po if "2025-01-01" <= p["promised_date"] <= CUTOFF]
            if n in (27, 30):
                contracts = {c["contract_id"]: c for c in t["supplier_contracts"]}
                for sid, rows in sorted(
                    groups(due, lambda p: p["supplier_id"]).items()
                ):
                    ot = (
                        100
                        * sum(p["on_time"] >= p["quantity_ordered"] for p in rows)
                        / len(rows)
                    )
                    fill = (
                        100
                        * sum(p["accepted"] >= p["quantity_ordered"] for p in rows)
                        / len(rows)
                    )
                    quality = div(
                        100 * total(rows, "accepted"), total(rows, "received")
                    )
                    if n == 27:
                        out.append(
                            [
                                sid,
                                len(rows),
                                rounded(ot),
                                rounded(fill),
                                rounded(quality),
                            ]
                        )
                    elif len(rows) >= 10:
                        price = (
                            100
                            * sum(
                                p["unit_price_cents"]
                                <= contracts[p["contract_id"]]["unit_price_cents"]
                                for p in rows
                            )
                            / len(rows)
                        )
                        score = (
                            0.4 * ot + 0.25 * fill + 0.2 * quality + 0.15 * price
                            if quality is not None
                            else None
                        )
                        out.append(
                            [
                                sid,
                                len(rows),
                                rounded(ot),
                                rounded(fill),
                                rounded(quality),
                                rounded(price),
                                rounded(score),
                            ]
                        )
                if n == 30:
                    out.sort(key=lambda r: (r[-1] is None, -(r[-1] or 0), r[0]))
            if n == 28:
                for p in sorted(self.po, key=lambda p: p["po_item_id"]):
                    expected = p["accepted"] * p["unit_price_cents"]
                    if p["order_date"] >= "2025-01-01" and (
                        p["quantity_ordered"] != p["accepted"]
                        or p["accepted"] != p["billed"]
                        or p["billed_cents"] != expected
                    ):
                        out.append(
                            [
                                p[k]
                                for k in [
                                    "po_item_id",
                                    "po_id",
                                    "supplier_id",
                                    "product_id",
                                    "quantity_ordered",
                                    "accepted",
                                    "billed",
                                    "billed_cents",
                                ]
                            ]
                            + [expected, p["billed_cents"] - expected]
                        )
            if n == 29:
                prices = {
                    key: total(rows, "ordered_cents") / total(rows, "quantity_ordered")
                    for key, rows in groups(
                        [p for p in self.po if p["order_date"] >= "2025-01-01"],
                        lambda p: (p["product_id"], p["supplier_id"]),
                    ).items()
                }
                for pid, items in groups(list(prices), lambda key: key[0]).items():
                    if len(items) < 2:
                        continue
                    low = min(prices[key] for key in items)
                    for key in items:
                        out.append(
                            [
                                *key,
                                rounded(prices[key]),
                                rounded(low),
                                ratio(prices[key] - low, low),
                            ]
                        )
                out.sort(key=lambda r: (r[0], r[4], r[1]))
        elif n == 34:
            gross = Counter()
            avg = self.average_inventory()
            for s in self.s25:
                gross[self.products[s["product_id"]]["category_id"]] += (
                    s["net_cents"] - s["cost_cents"]
                )
            for c in t["categories"]:
                cat = c["category_id"]
                out.append(
                    [
                        cat,
                        gross[cat],
                        avg.get(cat),
                        rounded(div(gross[cat], avg.get(cat)), 4),
                    ]
                )
            out.sort(key=lambda r: (r[-1] is None, -(r[-1] or 0), r[0]))
        elif n == 36:
            posted = Counter()
            for m in t["stock_movements"]:
                if m["movement_type"] == "receipt":
                    posted[m["receipt_id"]] += m["quantity_delta"]
            for g in sorted(t["goods_receipts"], key=lambda g: g["receipt_id"]):
                expected = g["quantity_received"] - g["quantity_rejected"]
                actual = posted[g["receipt_id"]]
                if expected != actual:
                    out.append(
                        [
                            g["receipt_id"],
                            g["po_item_id"],
                            expected,
                            actual,
                            actual - expected,
                        ]
                    )
        elif n in (38, 39, 40, 41, 42, 44, 47, 49, 50):
            if n == 38:
                exp = groups(
                    [e for e in self.exp25 if e["store_id"] is not None],
                    lambda e: e["store_id"],
                )
                for sid in self.stores:
                    net = total(sg[sid], "net_cents")
                    cost = total(sg[sid], "cost_cents")
                    expense = total(exp[sid], "expense_cents")
                    contribution = net - cost - expense
                    out.append(
                        [
                            sid,
                            net,
                            cost,
                            expense,
                            contribution,
                            ratio(contribution, net),
                        ]
                    )
                out.sort(key=lambda r: (-r[4], r[0]))
            if n == 39:
                pay = Counter()
                refund = Counter()
                items = {i["order_item_id"]: i for i in t["order_items"]}
                for p in t["payments"]:
                    if p["status"] == "settled" and p["payment_date"] <= CUTOFF:
                        pay[p["order_id"]] += p["amount_cents"]
                for r in t["returns"]:
                    if r["return_date"] <= CUTOFF:
                        refund[items[r["order_item_id"]]["order_id"]] += r[
                            "refund_cents"
                        ]
                for o in sorted(self.net, key=lambda o: o["order_id"]):
                    cash = pay[o["order_id"]] - refund[o["order_id"]]
                    if o["order_date"] >= "2025-01-01" and cash != o["net_cents"]:
                        out.append(
                            [o["order_id"], o["net_cents"], cash, cash - o["net_cents"]]
                        )
            if n == 40:
                es = groups(
                    [
                        e
                        for e in self.expenses
                        if "2024-11-01" <= e["entry_date"] <= CUTOFF
                    ],
                    lambda e: (e["store_id"], e["entry_date"][:7]),
                )
                ss = groups(
                    [
                        e
                        for e in self.sales
                        if "2024-11-01" <= e["order_date"] <= CUTOFF
                    ],
                    lambda s: (s["store_id"], s["order_date"][:7]),
                )
                for sid in self.stores:
                    ns = []
                    ee = []
                    for j, m in enumerate(["2024-11", "2024-12"] + self.m25):
                        net = total(ss[sid, m], "net_cents")
                        expense = total(es[sid, m], "expense_cents")
                        ns.append(net)
                        ee.append(expense)
                        if m < "2025-01":
                            continue
                        out.append(
                            [
                                sid,
                                m,
                                net,
                                expense,
                                ratio(expense, net),
                                ratio(sum(ee[-3:]), sum(ns[-3:])) if j >= 2 else None,
                            ]
                        )
            if n in (41, 42):
                if n == 41:
                    pg = groups(self.po, lambda p: p["supplier_id"])
                    ig = groups(self.invoices, lambda p: p["supplier_id"])
                    for sid in self.suppliers:
                        out.append(
                            [
                                sid,
                                total(pg[sid], "ordered_cents"),
                                sum(
                                    p["accepted"] * p["unit_price_cents"]
                                    for p in pg[sid]
                                ),
                                total(ig[sid], "billed_cents"),
                                total(ig[sid], "paid_cents"),
                                total(ig[sid], "balance_cents"),
                            ]
                        )
                    out.sort(key=lambda r: (-r[-1], r[0]))
                else:
                    received = Counter()
                    for p in self.po:
                        received[p["po_id"]] += p["accepted"] * p["unit_price_cents"]
                    for i in self.invoices:
                        value = received[i["po_id"]]
                        difference = i["billed_cents"] - value
                        if i["paid_cents"] > 0 and abs(difference) > 100:
                            out.append(
                                [
                                    i["supplier_invoice_id"],
                                    i["po_id"],
                                    i["billed_cents"],
                                    i["paid_cents"],
                                    value,
                                    difference,
                                    i["paid_cents"] - value,
                                ]
                            )
                    out.sort(key=lambda r: (-abs(r[-2]), r[0]))
            if n == 44:
                source = groups(
                    self.n25, lambda o: self.sessions[o["session_id"]]["source_id"]
                )
                ads = groups(
                    [
                        p
                        for p in t["marketing_campaigns"]
                        if "2025-01" <= p["month_key"] <= "2025-12"
                    ],
                    lambda p: p["source_id"],
                )
                for channel in t["traffic_sources"]:
                    sid = channel["source_id"]
                    net = total(source[sid], "net_cents")
                    gross = net - total(source[sid], "cost_cents")
                    spend = total(ads[sid], "spend_cents")
                    out.append(
                        [
                            sid,
                            net,
                            gross,
                            spend,
                            gross - spend,
                            ratio(gross - spend, net),
                        ]
                    )
                out.sort(key=lambda r: (-r[4], r[0]))
            if n == 47:
                staff = groups(
                    [h for h in self.staff if "2025-01" <= h["month_key"] <= "2025-12"],
                    lambda h: h["store_id"],
                )
                for sid in self.stores:
                    net = total(sg[sid], "net_cents")
                    labor = total(staff[sid], "labor_cents")
                    minutes = total(staff[sid], "worked_minutes") + total(
                        staff[sid], "overtime_minutes"
                    )
                    out.append(
                        [
                            sid,
                            net,
                            labor,
                            rounded(minutes / 60),
                            rounded(div(60 * net, minutes)),
                            ratio(labor, net),
                        ]
                    )
            if n in (49, 50):
                sales = groups(self.s25, lambda s: s["order_date"][:7])
                expense = groups(self.exp25, lambda e: e["entry_date"][:7])
                staff = groups(self.staff, lambda h: h["month_key"])
                po = groups(self.po, lambda p: p["order_date"][:7])
                ads = groups(t["marketing_campaigns"], lambda a: a["month_key"])
                monthly = {}
                for m in self.m25:
                    net = total(sales[m], "net_cents")
                    gross = net - total(sales[m], "cost_cents")
                    e = total(expense[m], "expense_cents")
                    h = total(staff[m], "labor_cents")
                    monthly[m] = [
                        m,
                        net,
                        gross,
                        e,
                        h,
                        total(ads[m], "spend_cents"),
                        total(po[m], "ordered_cents"),
                        gross - e - h,
                    ]
                if n == 49:
                    out = list(monthly.values())
                else:
                    for q, ms in sorted(groups(self.m25, quarter).items()):
                        data = [monthly[m] for m in ms]
                        net = sum(r[1] for r in data)
                        gross = sum(r[2] for r in data)
                        e = sum(r[3] for r in data)
                        h = sum(r[4] for r in data)
                        due = [p for p in self.po if p["promised_date"][:7] in ms]
                        net = (
                            net
                            if any(s["order_date"][:7] in ms for s in self.s25)
                            else None
                        )
                        margin = div(100 * gross, net)
                        er = div(100 * e, net)
                        hr = div(100 * h, net)
                        delivery = div(
                            100
                            * sum(p["on_time"] >= p["quantity_ordered"] for p in due),
                            len(due),
                        )
                        stock = sum(
                            i["quantity"] * i["unit_cost_cents"]
                            for i in t["inventory_snapshots"]
                            if i["snapshot_date"][:7] == max(ms)
                        )
                        risk = sum(
                            [
                                margin is not None and margin < 30,
                                er is not None and er > 50,
                                hr is not None and hr > 20,
                                delivery is not None and delivery < 60,
                            ]
                        )
                        out.append(
                            [
                                q,
                                net,
                                rounded(margin),
                                rounded(er),
                                rounded(hr),
                                rounded(delivery),
                                stock,
                                risk,
                                sum(v is None for v in [margin, er, hr, delivery]),
                            ]
                        )
        elif n in (3, 5, 8, 10, 12, 14, 15, 20, 23, 25, 26, 32, 37, 43, 45, 46):
            if n == 3:
                products = groups(
                    [s for s in self.s25 if s["channel"] == "store"],
                    lambda s: s["product_id"],
                )
                data = [
                    dict(id=pid, net=total(rows, "net_cents"), rows=rows)
                    for pid, rows in products.items()
                ]
                buckets = ntile(data, lambda p: (-p["net"], p["id"]), 4)
                for p in data:
                    margin = div(
                        100 * (p["net"] - total(p["rows"], "cost_cents")), p["net"]
                    )
                    if buckets[p["id"]] == 1 and margin is not None and margin < 30:
                        out.append(
                            [
                                p["id"],
                                p["net"],
                                rounded(margin),
                                total(p["rows"], "discount_cents"),
                                total(p["rows"], "refund_cents"),
                            ]
                        )
                out.sort(key=lambda r: (-r[1], r[0]))
            if n == 5:
                sales = groups(
                    [
                        s
                        for s in self.s25
                        if s["channel"] == "store" and s["order_date"] >= "2025-10-01"
                    ],
                    lambda s: s["store_id"],
                )
                targets = groups(
                    [
                        x
                        for x in t["sales_targets"]
                        if "2025-10" <= x["month_key"] <= "2025-12"
                    ],
                    lambda x: x["store_id"],
                )
                nets = {sid: total(sales[sid], "net_cents") for sid in self.stores}
                for sid in self.stores:
                    net = nets[sid]
                    rows = sales[sid]
                    margin = div(100 * (net - total(rows, "cost_cents")), net)
                    att = div(100 * net, total(targets[sid], "target_cents"))
                    ref = div(
                        100 * total(rows, "refund_cents"),
                        net + total(rows, "refund_cents"),
                    )
                    flags = sum(
                        [
                            margin is not None and margin < 30,
                            att is not None and att < 90,
                            ref is not None and ref > 8,
                        ]
                    )
                    rank = 1 + sum(value > net for value in nets.values())
                    out.append(
                        [
                            sid,
                            net,
                            rounded(margin),
                            rounded(att),
                            rounded(ref),
                            flags,
                            rank,
                        ]
                    )
                out.sort(key=lambda r: (-r[5], r[0]))
            if n == 8:
                lead = defaultdict(lambda: [0, 0])
                pis = {p["po_item_id"]: p for p in t["purchase_order_items"]}
                pos = {p["po_id"]: p for p in t["purchase_orders"]}
                for g in t["goods_receipts"]:
                    if not "2025-01-01" <= g["receipt_date"] <= CUTOFF:
                        continue
                    pi = pis[g["po_item_id"]]
                    po = pos[pi["po_id"]]
                    key = po["warehouse_id"], pi["product_id"]
                    accepted = g["quantity_received"] - g["quantity_rejected"]
                    lead[key][0] += (
                        date.fromisoformat(g["receipt_date"])
                        - date.fromisoformat(po["order_date"])
                    ).days * accepted
                    lead[key][1] += accepted
                for key, i in self.snap.items():
                    ld = div(*lead[key])
                    ld = 14 if ld is None else ld
                    sold = self.sold30[key]
                    shortage = sold * ld / 30 - i["quantity"]
                    if self.products[key[1]]["active"] and shortage > 0:
                        out.append(
                            [*key, i["quantity"], sold, rounded(ld), rounded(shortage)]
                        )
                out.sort(key=lambda r: (-r[-1], r[0], r[1]))
            if n == 10:
                ps = groups(self.po, lambda p: (p["warehouse_id"], p["product_id"]))
                for key, i in self.snap.items():
                    rows = ps[key]
                    due = [p for p in rows if p["promised_date"] <= CUTOFF]
                    incoming = sum(
                        max(0, p["quantity_ordered"] - p["accepted"])
                        for p in rows
                        if CUTOFF < p["promised_date"] <= "2026-01-30"
                    )
                    demand = self.sold30[key]
                    shortage = demand - i["quantity"] - incoming
                    if self.products[key[1]]["active"] and shortage > 0:
                        out.append(
                            [
                                *key,
                                i["quantity"],
                                i["quantity"] * i["unit_cost_cents"],
                                demand,
                                incoming,
                                shortage,
                                ratio(
                                    sum(
                                        p["on_time"] >= p["quantity_ordered"]
                                        for p in due
                                    ),
                                    len(due),
                                ),
                            ]
                        )
                out.sort(key=lambda r: (-r[-2], r[0], r[1]))
            if n in (12, 15):
                customers = groups(
                    self.n25 if n == 12 else self.online, lambda o: o["customer_id"]
                )
                data = [
                    dict(
                        id=uid,
                        last=max(o["order_date"] for o in rows),
                        freq=len(rows),
                        money=total(rows, "net_cents"),
                        gross=total(rows, "net_cents") - total(rows, "cost_cents"),
                    )
                    for uid, rows in customers.items()
                ]
                rtiles = ntile(
                    data,
                    lambda p: ("".join(chr(255 - ord(c)) for c in p["last"]), p["id"]),
                )
                ftiles = ntile(data, lambda p: (-p["freq"], p["id"]))
                mtiles = ntile(data, lambda p: (-p["money"], p["id"]))
                for p in sorted(data, key=lambda p: p["id"]):
                    recency = (
                        date.fromisoformat(CUTOFF) - date.fromisoformat(p["last"])
                    ).days
                    if n == 12:
                        rs = 6 - rtiles[p["id"]]
                        fs = 6 - ftiles[p["id"]]
                        ms = 6 - mtiles[p["id"]]
                        score = rs + fs + ms
                        out.append(
                            [
                                p["id"],
                                recency,
                                p["freq"],
                                p["money"],
                                rs,
                                fs,
                                ms,
                                (
                                    "high_value"
                                    if score >= 13
                                    else "low_activity" if score <= 6 else "regular"
                                ),
                            ]
                        )
                    elif mtiles[p["id"]] == 1 and p["freq"] >= 3 and recency >= 90:
                        out.append(
                            [p["id"], p["freq"], p["money"], p["gross"], recency]
                        )
                if n == 15:
                    out.sort(key=lambda r: (-r[3], r[0]))
            if n in (14, 45):
                customers = groups(self.online, lambda o: o["customer_id"])
                first = {
                    uid: min(rows, key=lambda o: (o["order_date"], o["order_id"]))
                    for uid, rows in customers.items()
                }
                if n == 14:
                    ss = groups(
                        [
                            s
                            for s in t["customer_sessions"]
                            if "2025-01-01" <= s["session_date"] <= CUTOFF
                        ],
                        lambda s: s["source_id"],
                    )
                    ns = groups(
                        self.n25, lambda o: self.sessions[o["session_id"]]["source_id"]
                    )
                    ads = groups(
                        [
                            p
                            for p in t["marketing_campaigns"]
                            if "2025-01" <= p["month_key"] <= "2025-12"
                        ],
                        lambda p: p["source_id"],
                    )
                    new = Counter(
                        self.sessions[o["session_id"]]["source_id"]
                        for o in first.values()
                        if o["order_date"] >= "2025-01-01"
                    )
                    for source in sorted(s["source_id"] for s in t["traffic_sources"]):
                        count = len(ss[source]) if ss[source] else None
                        converted = len({o["session_id"] for o in ns[source]})
                        spend = (
                            total(ads[source], "spend_cents") if ads[source] else None
                        )
                        net = total(ns[source], "net_cents") if ns[source] else None
                        out.append(
                            [
                                source,
                                count,
                                converted,
                                ratio(converted, count),
                                new[source],
                                spend,
                                rounded(div(spend, new[source])),
                                rounded(div(net, spend), 4),
                            ]
                        )
                else:
                    cohorts = groups(
                        list(first),
                        lambda uid: (
                            self.sessions[first[uid]["session_id"]]["source_id"],
                            first[uid]["order_date"][:7],
                        ),
                    )
                    ads = {
                        (p["source_id"], p["month_key"]): p["spend_cents"]
                        for p in t["marketing_campaigns"]
                    }
                    for key, uids in sorted(cohorts.items()):
                        gross = []
                        for uid in uids:
                            begin = date.fromisoformat(first[uid]["order_date"])
                            end = begin + timedelta(days=89)
                            if str(end) > CUTOFF:
                                continue
                            gross.append(
                                sum(
                                    o["net_cents"] - o["cost_cents"]
                                    for o in customers[uid]
                                    if begin
                                    <= date.fromisoformat(o["order_date"])
                                    <= end
                                )
                            )
                        if gross and key in ads:
                            avg = mean(gross)
                            cac = ads[key] / len(uids)
                            out.append(
                                [
                                    *key,
                                    len(gross),
                                    len(uids),
                                    rounded(avg),
                                    rounded(cac),
                                    rounded(avg - cac),
                                ]
                            )
            if n == 20:
                ig = groups(self.invoices, lambda i: i["supplier_id"])
                counts = Counter(
                    (i["supplier_id"], i["invoice_no"]) for i in self.invoices
                )
                received = Counter()
                for p in self.po:
                    received[p["po_id"]] += p["accepted"] * p["unit_price_cents"]
                for i in self.invoices:
                    flags = [
                        int(counts[i["supplier_id"], i["invoice_no"]] > 1),
                        int(
                            i["billed_cents"]
                            > 2 * mean(x["billed_cents"] for x in ig[i["supplier_id"]])
                        ),
                        int(i["balance_cents"] < 0),
                        int(abs(i["billed_cents"] - received[i["po_id"]]) > 100),
                    ]
                    if sum(flags):
                        out.append(
                            [
                                i["supplier_invoice_id"],
                                i["supplier_id"],
                                i["billed_cents"],
                                *flags,
                                sum(flags),
                            ]
                        )
                out.sort(key=lambda r: (-r[-1], r[0]))
            if n == 23:
                g = groups(
                    [s for s in self.staff if s["month_key"] == "2025-12"],
                    lambda s: (s["department_id"], s["position_id"]),
                )
                for key, rows in g.items():
                    if len(rows) < 3:
                        continue
                    avg = mean(s["base_cents"] for s in rows)
                    for s in rows:
                        if abs(s["base_cents"] - avg) > avg * 0.15:
                            out.append(
                                [
                                    s["employee_id"],
                                    *key,
                                    s["base_cents"],
                                    rounded(avg),
                                    1
                                    + sum(
                                        p["base_cents"] > s["base_cents"] for p in rows
                                    ),
                                    ratio(s["base_cents"] - avg, avg),
                                ]
                            )
                out.sort(key=lambda r: (r[1], r[2], r[5], r[0]))
            if n == 25:
                initial = {
                    h["employee_id"]: h["department_id"]
                    for h in t["employment_history"]
                    if any(
                        e["employee_id"] == h["employee_id"]
                        and e["hire_date"] == h["start_date"]
                        for e in t["employees"]
                    )
                }
                g = groups(
                    t["employees"],
                    lambda e: (initial[e["employee_id"]], quarter(e["hire_date"])),
                )
                for key, rows in sorted(g.items()):
                    row = [*key]
                    for days in [90, 180]:
                        mature = [
                            e
                            for e in rows
                            if date.fromisoformat(e["hire_date"]) + timedelta(days=days)
                            <= date.fromisoformat(CUTOFF)
                        ]
                        retained = sum(
                            e["termination_date"] is None
                            or date.fromisoformat(e["termination_date"])
                            > date.fromisoformat(e["hire_date"]) + timedelta(days=days)
                            for e in mature
                        )
                        row.extend([len(mature), ratio(retained, len(mature))])
                    out.append(row)
            if n == 26:
                contracts = {c["contract_id"]: c for c in t["supplier_contracts"]}
                for key, rows in groups(
                    self.po, lambda p: (p["supplier_id"], p["product_id"])
                ).items():
                    prev = None
                    for p in sorted(
                        rows, key=lambda p: (p["order_date"], p["po_item_id"])
                    ):
                        cp = contracts[p["contract_id"]]["unit_price_cents"]
                        price = p["unit_price_cents"]
                        if p["order_date"] >= "2025-01-01":
                            out.append(
                                [
                                    p["po_item_id"],
                                    *key,
                                    price,
                                    cp,
                                    price - cp,
                                    prev,
                                    (
                                        ratio(price - prev, prev)
                                        if prev is not None
                                        else None
                                    ),
                                ]
                            )
                        prev = price
                out.sort(key=lambda r: r[0])
            if n == 32:
                sales = Counter()
                stock = Counter()
                for s in self.s25:
                    sales[s["product_id"]] += s["net_cents"]
                for (_, pid), i in self.snap.items():
                    stock[pid] += i["quantity"] * i["unit_cost_cents"]
                for pid in sorted(self.products):
                    sp = div(100 * sales[pid], sum(sales.values()))
                    ip = div(100 * stock[pid], sum(stock.values()))
                    gap = ip - sp if sp is not None and ip is not None else None
                    out.append(
                        [
                            pid,
                            sales[pid],
                            stock[pid],
                            rounded(sp, 4),
                            rounded(ip, 4),
                            rounded(gap, 4),
                        ]
                    )
                out.sort(key=lambda r: (r[-1] is None, -(r[-1] or 0), r[0]))
            if n == 37:
                g = groups(
                    [
                        p
                        for p in self.po
                        if "2025-01-01" <= p["promised_date"] <= CUTOFF
                        and p["quantity_ordered"] > p["accepted"]
                    ],
                    lambda p: (p["supplier_id"], p["warehouse_id"], p["product_id"]),
                )
                sums = defaultdict(lambda: [0, 0, 0])
                for (sid, w, pid), rows in g.items():
                    if (w, pid) not in self.snap:
                        continue
                    i = self.snap[w, pid]
                    sums[sid][0] += 1
                    sums[sid][1] += sum(
                        (p["quantity_ordered"] - p["accepted"]) * p["unit_price_cents"]
                        for p in rows
                    )
                    sums[sid][2] += i["quantity"] * i["unit_cost_cents"]
                out = [[sid, *values] for sid, values in sums.items()]
                out.sort(key=lambda r: (-r[2], r[0]))
            if n == 43:
                ig = groups(self.invoices, lambda i: i["supplier_id"])
                pg = groups(
                    [
                        p
                        for p in self.po
                        if "2025-01-01" <= p["promised_date"] <= CUTOFF
                    ],
                    lambda p: p["supplier_id"],
                )
                for sid in self.suppliers:
                    outstanding = sum(max(0, i["balance_cents"]) for i in ig[sid])
                    overdue = sum(
                        max(0, i["balance_cents"])
                        for i in ig[sid]
                        if i["due_date"] < CUTOFF
                    )
                    due = pg[sid]
                    op = div(100 * overdue, outstanding)
                    ot = div(
                        100 * sum(p["on_time"] >= p["quantity_ordered"] for p in due),
                        len(due),
                    )
                    if (outstanding and overdue >= 500000 and op > 40) or (
                        len(due) >= 10 and ot is not None and ot < 60
                    ):
                        out.append(
                            [
                                sid,
                                outstanding,
                                overdue,
                                rounded(op),
                                len(due),
                                rounded(ot),
                            ]
                        )
                out.sort(key=lambda r: (-r[1], r[0]))
            if n == 46:
                g = groups(
                    [s for s in self.s25 if s["channel"] == "online"],
                    lambda s: self.sessions[s["session_id"]]["source_id"],
                )
                for sid, rows in g.items():
                    before = sum(
                        s["quantity"] * s["unit_price_cents"] - s["discount_cents"]
                        for s in rows
                    )
                    original_cost = sum(
                        s["quantity"] * s["unit_cost_cents"] for s in rows
                    )
                    refund = total(rows, "refund_cents")
                    out.append(
                        [
                            sid,
                            before,
                            refund,
                            ratio(refund, before),
                            before - original_cost,
                            total(rows, "net_cents") - total(rows, "cost_cents"),
                        ]
                    )
                out.sort(key=lambda r: (r[3] is None, -(r[3] or 0), r[0]))
        else:
            return None
        return out
