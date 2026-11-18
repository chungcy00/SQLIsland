"""Independent raw-fact computations for revised business definitions, without task SQL/views."""

from collections import Counter, defaultdict
from datetime import date, timedelta
from statistics import mean
from independent import groups, total, div, ratio, rounded, quarter, CUTOFF

REVISED = {5, 14, 19, 20, 28, 37, 42, 45, 50}


def result(model, number):
    t = model.t
    if number == 5:
        sales = groups(
            [
                r
                for r in model.s25
                if r["channel"] == "store" and r["order_date"] >= "2025-10-01"
            ],
            lambda r: r["store_id"],
        )
        targets = groups(
            [r for r in t["sales_targets"] if "2025-10" <= r["month_key"] <= "2025-12"],
            lambda r: r["store_id"],
        )
        stores = []
        for sid in model.stores:
            rows = sales[sid]
            net, cost, refund = (
                total(rows, key) for key in ["net_cents", "cost_cents", "refund_cents"]
            )
            target = total(targets[sid], "target_cents") if targets[sid] else None
            stores.append(
                dict(
                    sid=sid,
                    net=net,
                    cost=cost,
                    refund=refund,
                    target=target,
                    margin=div(100 * (net - cost), net) if rows else None,
                    attainment=div(100 * net, target),
                    rate=div(100 * refund, net + refund) if rows else None,
                )
            )
        bm = div(
            100 * sum(r["net"] - r["cost"] for r in stores),
            sum(r["net"] for r in stores),
        )
        eligible = [r for r in stores if r["target"] is not None and r["target"] > 0]
        ba = div(
            100 * sum(r["net"] for r in eligible), sum(r["target"] for r in eligible)
        )
        br = div(
            100 * sum(r["refund"] for r in stores),
            sum(r["net"] + r["refund"] for r in stores),
        )
        out = []
        for r in stores:
            flags = sum(
                [
                    r["margin"] is not None and bm is not None and r["margin"] < bm - 1,
                    r["attainment"] is not None
                    and ba is not None
                    and r["attainment"] < ba * 0.8,
                    r["rate"] is not None and br is not None and r["rate"] > br * 1.25,
                ]
            )
            rank = 1 + sum(other["net"] > r["net"] for other in stores)
            out.append(
                [
                    r["sid"],
                    r["net"],
                    rounded(r["margin"]),
                    rounded(r["attainment"]),
                    rounded(r["rate"]),
                    flags,
                    rank,
                ]
            )
        return sorted(out, key=lambda r: (-r[5], r[0]))
    if number in (14, 45):
        customers = groups(model.online, lambda o: o["customer_id"])
        first = {
            uid: min(rows, key=lambda o: (o["order_date"], o["order_id"]))
            for uid, rows in customers.items()
        }
        if number == 14:
            selected = {
                s["session_id"]: s
                for s in t["customer_sessions"]
                if "2025-01-01" <= s["session_date"] <= CUTOFF
            }
            session_groups = groups(list(selected.values()), lambda s: s["source_id"])
            orders = groups(
                [o for o in model.n25 if o["session_id"] in selected],
                lambda o: selected[o["session_id"]]["source_id"],
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
                selected[o["session_id"]]["source_id"]
                for o in first.values()
                if o["session_id"] in selected
                and "2025-01-01" <= o["order_date"] <= CUTOFF
            )
            out = []
            for sid in sorted(s["source_id"] for s in t["traffic_sources"]):
                sessions = len(session_groups[sid])
                converted = len({o["session_id"] for o in orders[sid]})
                spend = total(ads[sid], "spend_cents") if ads[sid] else None
                revenue = total(orders[sid], "net_cents") if orders[sid] else None
                out.append(
                    [
                        sid,
                        sessions,
                        converted,
                        ratio(converted, sessions),
                        new[sid],
                        spend,
                        rounded(div(spend, new[sid])),
                        rounded(div(revenue, spend), 4),
                    ]
                )
            return out
        cohorts = groups(
            list(first),
            lambda uid: (
                model.sessions[first[uid]["session_id"]]["source_id"],
                first[uid]["order_date"][:7],
            ),
        )
        ads = {
            (p["source_id"], p["month_key"]): p["spend_cents"]
            for p in t["marketing_campaigns"]
        }
        out = []
        for key, uids in sorted(cohorts.items()):
            values = []
            for uid in uids:
                begin = date.fromisoformat(first[uid]["order_date"])
                end = begin + timedelta(days=89)
                if str(end) <= CUTOFF:
                    values.append(
                        sum(
                            o["net_cents"] - o["cost_cents"]
                            for o in customers[uid]
                            if begin <= date.fromisoformat(o["order_date"]) <= end
                        )
                    )
            if values:
                gross = mean(values)
                cac = ads[key] / len(uids) if key in ads else None
                out.append(
                    [
                        *key,
                        len(values),
                        len(uids),
                        rounded(gross),
                        rounded(cac),
                        rounded(gross - cac) if cac is not None else None,
                    ]
                )
        return out
    if number == 19:
        ledger = Counter()
        bank = Counter()
        for e in model.expenses:
            if "2025-01-01" <= e["entry_date"] <= CUTOFF:
                ledger[(0, e["reference_no"])] += e["expense_cents"]
        for b in t["bank_transactions"]:
            if "2025-01-01" <= b["transaction_date"] <= CUTOFF:
                key = (
                    (1, str(b["bank_id"]))
                    if b["reference_no"] is None
                    else (0, b["reference_no"])
                )
                bank[key] -= b["amount_cents"]
        out = []
        for key in set(ledger) | set(bank):
            if key not in ledger or key not in bank or ledger[key] != bank[key]:
                label = "BANK-" + key[1] if key[0] else key[1]
                issue = (
                    "bank_only"
                    if key not in ledger
                    else "ledger_only" if key not in bank else "difference"
                )
                out.append(
                    [
                        label,
                        ledger.get(key),
                        bank.get(key),
                        bank[key] - ledger[key],
                        issue,
                        "unreferenced_bank" if key[0] else "reference",
                    ]
                )
        return sorted(out, key=lambda r: (r[0], r[-1]))
    if number in (20, 28, 42):
        invoices = {
            i["supplier_invoice_id"]: i
            for i in t["supplier_invoices"]
            if i["invoice_date"] <= CUTOFF
        }
        items = {p["po_item_id"]: p for p in t["purchase_order_items"]}
        billed = groups(
            [
                r
                for r in t["supplier_invoice_items"]
                if r["supplier_invoice_id"] in invoices
            ],
            lambda r: r["supplier_invoice_id"],
        )
        if number == 20:
            face = {
                iid: sum(r["quantity_billed"] * r["unit_price_cents"] for r in rows)
                for iid, rows in billed.items()
            }
            expected = {
                iid: sum(
                    r["quantity_billed"] * items[r["po_item_id"]]["unit_price_cents"]
                    for r in rows
                )
                for iid, rows in billed.items()
            }
            suppliers = groups(model.invoices, lambda i: i["supplier_id"])
            duplicate = Counter(
                (i["supplier_id"], i["invoice_no"]) for i in model.invoices
            )
            out = []
            for i in model.invoices:
                iid = i["supplier_invoice_id"]
                flags = [
                    int(duplicate[i["supplier_id"], i["invoice_no"]] > 1),
                    int(
                        face[iid]
                        > 2
                        * mean(
                            face[x["supplier_invoice_id"]]
                            for x in suppliers[i["supplier_id"]]
                        )
                    ),
                    int(i["balance_cents"] < 0),
                    int(abs(face[iid] - expected[iid]) > 100),
                ]
                if sum(flags):
                    out.append(
                        [iid, i["supplier_id"], i["billed_cents"], *flags, sum(flags)]
                    )
            return sorted(out, key=lambda r: (-r[-1], r[0]))
        if number == 28:
            lines = groups(
                [r for rows in billed.values() for r in rows], lambda r: r["po_item_id"]
            )
            out = []
            for p in sorted(model.po, key=lambda p: p["po_item_id"]):
                if p["order_date"] < "2025-01-01":
                    continue
                rows = lines[p["po_item_id"]]
                quantity = total(rows, "quantity_billed")
                amount = sum(r["quantity_billed"] * r["unit_price_cents"] for r in rows)
                expected = p["accepted"] * p["unit_price_cents"]
                if (
                    p["quantity_ordered"] != p["accepted"]
                    or p["accepted"] != quantity
                    or amount != expected
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
                            ]
                        ]
                        + [quantity, amount, expected, amount - expected]
                    )
            return out
        accepted = Counter()
        for r in t["goods_receipts"]:
            if r["receipt_date"] <= CUTOFF:
                accepted[r["po_item_id"]] += (
                    r["quantity_received"] - r["quantity_rejected"]
                )
        consumed = Counter()
        allocated = Counter()
        lines = sorted(
            [r for rows in billed.values() for r in rows],
            key=lambda r: (
                invoices[r["supplier_invoice_id"]]["invoice_date"],
                r["supplier_invoice_id"],
                r["supplier_invoice_item_id"],
            ),
        )
        for r in lines:
            key = r["po_item_id"]
            qty = min(r["quantity_billed"], max(accepted[key] - consumed[key], 0))
            allocated[r["supplier_invoice_id"]] += qty * items[key]["unit_price_cents"]
            consumed[key] += r["quantity_billed"]
        out = []
        for i in model.invoices:
            iid = i["supplier_invoice_id"]
            value = allocated[iid]
            difference = i["billed_cents"] - value
            if i["paid_cents"] > 0 and abs(difference) > 100:
                out.append(
                    [
                        iid,
                        i["po_id"],
                        i["billed_cents"],
                        i["paid_cents"],
                        value,
                        difference,
                        i["paid_cents"] - value,
                    ]
                )
        return sorted(out, key=lambda r: (-abs(r[-2]), r[0]))
    if number == 37:
        pairs = Counter()
        for p in model.po:
            if (
                "2025-01-01" <= p["promised_date"] <= CUTOFF
                and p["quantity_ordered"] > p["accepted"]
            ):
                pairs[p["supplier_id"], p["warehouse_id"], p["product_id"]] += (
                    p["quantity_ordered"] - p["accepted"]
                ) * p["unit_price_cents"]
        snapshots = {
            (i["warehouse_id"], i["product_id"]): i
            for i in t["inventory_snapshots"]
            if i["snapshot_date"] == CUTOFF
        }
        suppliers = defaultdict(list)
        for (sid, w, p), value in pairs.items():
            suppliers[sid].append((w, p, value))
        out = []
        for sid, rows in suppliers.items():
            stock = (
                sum(
                    snapshots[w, p]["quantity"] * snapshots[w, p]["unit_cost_cents"]
                    for w, p, _ in rows
                )
                if all((w, p) in snapshots for w, p, _ in rows)
                else None
            )
            out.append([sid, len(rows), sum(value for _, _, value in rows), stock])
        return sorted(out, key=lambda r: (-r[2], r[0]))
    if number == 50:
        sales = groups(model.sales, lambda r: quarter(r["order_date"]))
        expenses = groups(model.expenses, lambda r: quarter(r["entry_date"]))
        staff = groups(model.staff, lambda r: quarter(r["month_key"] + "-01"))
        due = groups(model.po, lambda r: quarter(r["promised_date"]))
        metrics = {}
        for year in [2024, 2025]:
            for q in range(1, 5):
                key = f"{year}-Q{q}"
                rows = sales[key]
                net = total(rows, "net_cents") if rows else None
                gross = sum(r["net_cents"] - r["cost_cents"] for r in rows)
                metrics[key] = [
                    net,
                    div(100 * gross, net),
                    div(100 * total(expenses[key], "expense_cents"), net),
                    div(100 * total(staff[key], "labor_cents"), net),
                    div(
                        100
                        * sum(p["on_time"] >= p["quantity_ordered"] for p in due[key]),
                        len(due[key]),
                    ),
                ]
        out = []
        for q, end in enumerate(["03-31", "06-30", "09-30", "12-31"], 1):
            key = f"2025-Q{q}"
            current = metrics[key]
            prior = metrics[f"2024-Q{q}"]
            changes = [
                a - b if a is not None and b is not None else None
                for a, b in zip(current[1:4], prior[1:4])
            ]
            snaps = [
                i
                for i in t["inventory_snapshots"]
                if i["snapshot_date"] == "2025-" + end
            ]
            stock = (
                sum(i["quantity"] * i["unit_cost_cents"] for i in snaps)
                if len(snaps) == len(t["products"]) * len(t["warehouses"])
                else None
            )
            risk = sum(
                [
                    changes[0] is not None and changes[0] < -3,
                    changes[1] is not None and changes[1] > 10,
                    changes[2] is not None and changes[2] > 10,
                    current[4] is not None and current[4] < 60,
                ]
            )
            missing = sum(v is None for v in [*changes, current[4], stock])
            out.append(
                [
                    key,
                    current[0],
                    *[rounded(v) for v in current[1:]],
                    stock,
                    *[rounded(v) for v in changes],
                    risk,
                    missing,
                ]
            )
        return out
    raise ValueError(number)
