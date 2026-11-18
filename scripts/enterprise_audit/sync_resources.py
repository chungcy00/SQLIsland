"""Export repaired canonical data, audit queries and synchronized learning resources."""

import ast
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil
import sqlite3
import time
from repair_data import ROOT, CONTENT, ORIGINAL, DBREL, OUT, connect, dump

VERSION = "4.2.0"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def query(db, sql):
    cur = db.execute(sql)
    return {
        "columns": [x[0] for x in cur.description],
        "rows": [list(row) for row in cur],
    }


def fix_task(t):
    n = int(t["id"][2:])
    sql = t["sqliteSql"]
    # All operational views are fixed as-of 2025-12-31. Calendar grids also stop at that date.
    sql = sql.replace(
        "SELECT DISTINCT month_key FROM calendar_days)",
        "SELECT DISTINCT month_key FROM calendar_days WHERE day<='2025-12-31')",
    )
    sql = sql.replace(
        "month_key>='2025-01'", "month_key BETWEEN '2025-01' AND '2025-12'"
    )
    sql = sql.replace(
        "month_key>='2024-12'", "month_key BETWEEN '2024-12' AND '2025-12'"
    )
    if n == 4:
        sql = sql.replace(
            "WHERE day BETWEEN p.start_date AND p.end_date",
            "WHERE day BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store')",
        )
        t[
            "requirements"
        ] += " 促销日指存在至少一个可用于线下门店的活动的自然日，不要求每笔交易实际使用优惠；区域或品类活动也计入该日。线上专属活动不标记线下促销日。重叠活动只计一个自然日，销售先按日汇总，不直接按活动区间展开明细。"
        t["commonError"] = (
            "按活动日期直接连接销售，重叠活动使同一明细被重复累加；把存在活动误当成每笔交易均适用。"
        )
    if n == 7:
        start = sql.index("b AS (")
        end = sql.index(" SELECT b.warehouse_id", start)
        sql = (
            sql[:start]
            + "b AS (SELECT w.warehouse_id,c.category_id,CASE WHEN COUNT(i.snapshot_id)=2*COUNT(DISTINCT p.product_id) THEN SUM(i.quantity*i.unit_cost_cents)/2.0 ELSE NULL END avg_stock FROM warehouses w CROSS JOIN categories c LEFT JOIN products p ON p.category_id=c.category_id LEFT JOIN inventory_snapshots i ON i.warehouse_id=w.warehouse_id AND i.product_id=p.product_id AND i.snapshot_date IN ('2024-12-31','2025-12-31') GROUP BY w.warehouse_id,c.category_id)"
            + sql[end:]
        )
        t[
            "requirements"
        ] += " 缺失任一商品的期初或期末快照时，该仓库类别的平均库存及周转指标返回NULL，不将缺失当作零。"
    if n == 9:
        sql = sql.replace(
            "WHERE quantity_delta>0",
            "WHERE quantity_delta>0 AND movement_date<='2025-12-31'",
        )
        sql = sql.replace(
            "WHERE movement_type='sale' GROUP BY",
            "WHERE quantity_delta<0 AND movement_date<='2025-12-31' GROUP BY",
        )
        t["requirements"] = (
            t["requirements"]
            .replace("收货与退货视作入库批次", "收货、退货与调入视作本仓入库批次")
            .replace(
                "累计销售出库消耗最早批次", "累计销售、调出及损耗按FIFO消耗最早批次"
            )
        )
        t[
            "requirements"
        ] += " 计算的是本仓入库库龄，调入日重置本仓库龄，不能推断商品生产年龄。"
    if n == 10:
        sql = sql.replace(
            "promised_date>'2025-12-31' AND quantity_ordered>accepted",
            "promised_date>'2025-12-31' AND promised_date<='2026-01-30' AND quantity_ordered>accepted",
        )
        t["requirements"] = t["requirements"].replace(
            "承诺日严格晚于2025-12-31", "承诺日在2026-01-01至2026-01-30内"
        )
        t["requirements"] += " 更远承诺日期的在途不用于抵扣当前30日补货缺口。"
    if n == 17:
        sql = sql.replace(
            "CASE WHEN paid_cents=0 THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' WHEN balance_cents=0 THEN 'paid' ELSE 'overpaid' END",
            "CASE WHEN balance_cents=0 THEN 'paid' WHEN paid_cents=0 THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END",
        )
        t["requirements"] += " paid表示已结清，包含已批准贷项全额抵销而无需付现的情况。"
    if n in (22, 40):
        sql = sql.replace(
            "month_key BETWEEN '2025-01' AND '2025-12'",
            "month_key BETWEEN '2024-11' AND '2025-12'",
        )
        sql = sql.replace(
            "BETWEEN '2025-01-01' AND '2025-12-31'",
            "BETWEEN '2024-11-01' AND '2025-12-31'",
        )
        final = "z" if n == 22 else "p"
        sql = sql.replace(
            "FROM " + final + " ORDER BY",
            "FROM "
            + final
            + " WHERE month_key BETWEEN '2025-01' AND '2025-12' ORDER BY",
        )
        t[
            "requirements"
        ] += " 三个月滚动指标包含2024年11—12月历史后再筛选2025年输出，不在年度边界重新开始累计；确实不足三个月时返回NULL。"
    if n == 23:
        t[
            "requirements"
        ] += " 实发基础薪资包含月内入离职的按日折算，偏离仅供复核，不能直接认定为合同薪资错误。"
    if n == 28:
        t[
            "requirements"
        ] += " 本题核对原始开票行，不冲减后续贷项；净应付与贷项的核对见财务题。"
    if n == 29:
        sql = sql.replace("ROUND(avg_price,2)", "ROUND(avg_price*100,0)/100.0").replace(
            "ROUND(low,2)", "ROUND(low*100,0)/100.0"
        )
        t[
            "requirements"
        ] += " 派生加权均价允许末位1分的跨引擎浮点舍入差异；原始整数金额、件数及标识仍须精确。"
    if n == 27:
        t["requirements"] += " 仅输出至少有一条期间到期采购行的供应商。"
    if n == 46:
        t["requirements"] += " 仅输出期间存在有效线上订单的渠道。"
    if n == 24:
        t["requirements"] = "2025年第四季度（10—12月）。" + t["requirements"]
    if n == 34:
        old = "b AS (SELECT p.category_id,SUM(i.quantity*i.unit_cost_cents)/2.0 avg_stock FROM inventory_snapshots i JOIN products p ON p.product_id=i.product_id WHERE i.snapshot_date IN ('2024-12-31','2025-12-31') GROUP BY p.category_id)"
        if old in sql:
            sql = sql.replace(
                old,
                "b AS (SELECT p.category_id,CASE WHEN COUNT(i.snapshot_id)=2*COUNT(DISTINCT p.product_id)*(SELECT COUNT(*) FROM warehouses) THEN SUM(i.quantity*i.unit_cost_cents)/2.0 ELSE NULL END avg_stock FROM products p CROSS JOIN warehouses w LEFT JOIN inventory_snapshots i ON i.product_id=p.product_id AND i.warehouse_id=w.warehouse_id AND i.snapshot_date IN ('2024-12-31','2025-12-31') GROUP BY p.category_id)",
            )
            t[
                "requirements"
            ] += " 缺失期初或期末快照时对应类别的平均库存与回报倍数返回NULL。"
    if n in (17, 18, 20, 41, 42, 43):
        t[
            "requirements"
        ] += " 本库v_invoice_balance的billed_cents为发票面额减截至截止日已批准贷项后的净应付，paid_cents仅计截止日前付款；原始发票面额保留在supplier_invoice_items。"
    if n == 45:
        sql = sql.replace(
            "a.idx+89<=1095",
            "a.idx+89<=(SELECT day_index FROM calendar_days WHERE day='2025-12-31')",
        )
        t[
            "requirements"
        ] += " 净毛利采用截至2025-12-31已发生退款按原订单日归属的统一口径。"
    t["sqliteSql"] = sql
    t["mysqlSql"] = re.sub(r" AS INTEGER\)", " AS SIGNED)", sql)
    t["contentVersion"] = VERSION
    t["referenceSolutions"] = [
        {"kind": "reference", "mysqlSql": t["mysqlSql"], "sqliteSql": sql},
        {
            "kind": "derived-table equivalent",
            "mysqlSql": "SELECT * FROM (" + t["mysqlSql"] + ") AS equivalent_result",
            "sqliteSql": "SELECT * FROM (" + sql + ") AS equivalent_result",
            "explanation": "相同关系表达式的派生表写法，判题按输出而非SQL文本匹配。",
        },
    ]
    t["explanation"] = (
        t.get("explanation", "")
        + "\n审计口径：先核定日期范围、输出粒度、退款和贷项，再在各事实表中独立聚合，防止连接放大。"
    )
    return t


def export():
    db = connect(CONTENT / DBREL)
    tasks = [
        fix_task(
            json.loads(
                (
                    ORIGINAL / f"enterprise_reference/business_tasks/BP{n:02}.json"
                ).read_text()
            )
        )
        for n in range(1, 51)
    ]
    schema = {
        n: s
        for n, s in db.execute(
            "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
        )
    }
    views = {
        n: s
        for n, s in db.execute(
            "SELECT name,sql FROM sqlite_master WHERE type='view' ORDER BY rowid"
        )
    }
    indexes = collections.defaultdict(list)
    for name, sql in db.execute(
        "SELECT tbl_name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
    ):
        indexes[name].append(sql)
    # Reuse the reviewed DDL conversion functions only, with no legacy generation/export side effects.
    tree = ast.parse(
        (ORIGINAL / "enterprise_reference/validation/export_enterprise.py").read_text()
    )
    env = {"re": re, "schema": schema}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in (
            "split",
            "mysqltype",
            "mysql_ddl",
        ):
            exec(
                compile(
                    ast.Module(body=[node], type_ignores=[]),
                    "<reviewed-ddl-conversion>",
                    "exec",
                ),
                env,
            )

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

    seed_dir = ROOT / ".tooling/audit-sql-seed"
    seed_dir.mkdir(exist_ok=True)
    oldmeta = json.loads(
        (ORIGINAL / "question_resource/databases/enterprise/schema.json").read_text()
    )["tables"]
    metadata = {}
    for name in schema:
        prior = oldmeta.get(name, {})
        fks = {
            x[3]: {"table": x[2], "column": x[4]}
            for x in db.execute(f"PRAGMA foreign_key_list({name})")
        }
        oldcols = {x["name"]: x for x in prior.get("columns", [])}
        cols = []
        for _, col, typ, nn, default, pk in db.execute(f"PRAGMA table_info({name})"):
            c = dict(oldcols.get(col, {}))
            c.update(
                name=col,
                sqliteType=typ,
                mysqlType=env["mysqltype"](col, typ),
                nullable=not (nn or pk),
                primaryKey=bool(pk),
                foreignKey=fks.get(col),
                default=default,
            )
            c.setdefault(
                "description",
                {
                    "campaign_type": "活动性质，节庆/会员/清仓/限时/季节",
                    "channel_scope": "适用渠道all/store/online",
                    "store_scope": "all全门店或selected指定门店，见promotion_stores",
                    "category_scope": "all全品类或selected指定品类，见promotion_categories",
                    "members_only": "是否仅限在交易日前入会的会员",
                    "member_since_date": "入会日期，NULL表示未入会",
                    "min_basket_cents": "订单折前金额门槛，马币分",
                    "discount_basis_points": "优惠率，万分比，明细优惠按半分向上取整到分",
                    "demand_change_bp": "虚构模型需求效应参数，可负，不能作为实证因果结论",
                    "fulfillment_warehouse_id": "门店对应区域配送仓",
                    "discontinued_date": "停止销售日期，NULL为仍在售",
                    "cancellation_reason": "取消原因，正常完成或待处理为NULL",
                    "expected_receipt_date": "调拨预计到货日",
                    "received_date": "调拨实际到货日，截止日前未到为NULL",
                    "order_priority": "normal常规或urgent紧急采购",
                    "cancellation_date": "采购取消日期，正常订单为NULL",
                    "return_id": "退货来源编号",
                    "transfer_id": "调拨来源编号",
                    "adjustment_id": "盘点损耗来源编号",
                    "credit_date": "批准贷项日期",
                    "amount_cents": "金额（整数马币分）",
                    "quantity_lost": "盘点确认损耗件数",
                    "document_date": "原始费用单据日期",
                    "entry_id": "费用凭证来源键",
                }.get(col, "业务来源字段，约束见建表语句"),
            )
            cols.append(c)
        metadata[name] = {
            "description": prior.get(
                "description",
                {
                    "supplier_credit_notes": "经批准的供应商贷项，冲减应付",
                    "stock_transfers": "仓间调拨单，发出与收货按运输期间分日入账，未到货为在途",
                    "stock_adjustments": "盘点损耗单，只作用于现有可售库存",
                    "expense_documents": "费用凭证对应的原始业务单据",
                    "promotion_stores": "限定促销适用门店，一行一个活动门店组合",
                    "promotion_categories": "限定促销适用品类，一行一个活动品类组合",
                }.get(name, name),
            ),
            "rowCount": db.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0],
            "columns": cols,
            "sqliteDDL": schema[name],
            "mysqlDDL": env["mysql_ddl"](name),
            "indexes": indexes[name],
        }
        with (CONTENT / f"enterprise_reference/structured_data/{name}.csv").open(
            "w", newline="", encoding="utf-8"
        ) as out:
            writer = csv.writer(out)
            writer.writerow([x["name"] for x in cols])
            writer.writerows(
                [
                    [r"\N" if v is None else v for v in row]
                    for row in db.execute("SELECT * FROM " + name)
                ]
            )
        with (seed_dir / (name + ".sql")).open("w") as out:
            cur = db.execute("SELECT * FROM " + name)
            while batch := cur.fetchmany(500):
                out.write(
                    "INSERT INTO "
                    + name
                    + " VALUES\n"
                    + ",\n".join(
                        "(" + ",".join(literal(v) for v in row) + ")" for row in batch
                    )
                    + ";\n"
                )
    # Dependency closure includes view dependencies and source-document foreign keys.
    allnames = set(schema) | set(views)

    def deps(name):
        if name in views:
            return {
                n
                for n in re.findall(
                    r"\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9]*)", views[name], re.I
                )
                if n in allnames
            }
        return {x[2] for x in db.execute("PRAGMA foreign_key_list(" + name + ")")}

    groups = {}
    for group in [
        "retail",
        "inventory",
        "ecommerce",
        "finance",
        "hr",
        "procurement",
        "enterprise",
    ]:
        previous = json.loads(
            (ORIGINAL / f"question_resource/databases/{group}/schema.json").read_text()
        )
        names = set(previous["tables"]) | set(previous["views"])
        if group in ("finance", "enterprise"):
            names.add("expense_documents")
        if group == "enterprise":
            names = allnames.copy()
        while True:
            expanded = names | set().union(*(deps(n) for n in names))
            if "promotions" in expanded:
                expanded |= {"promotion_stores", "promotion_categories"}
            if expanded == names:
                break
            names = expanded
        tables = [n for n in schema if n in names]
        vs = [n for n in views if n in names]
        dest = CONTENT / f"question_resource/databases/{group}"
        file = dest / (group + ".sqlite")
        if group != "enterprise":
            file.unlink()
            out = sqlite3.connect(file)
            db.backup(out)
            out.execute("PRAGMA foreign_keys=OFF")
            for name in views:
                if name not in names:
                    out.execute("DROP VIEW " + name)
            for name in reversed(list(schema)):
                if name not in names:
                    out.execute("DROP TABLE " + name)
            out.commit()
            out.execute("VACUUM")
            out.close()
        check = connect(file)
        assert check.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert not check.execute("PRAGMA foreign_key_check").fetchall()
        check.close()
        groups[group] = {
            "tables": len(tables),
            "views": len(vs),
            "rows": sum(metadata[n]["rowCount"] for n in tables),
            "bytes": file.stat().st_size,
            "sha256": sha(file),
        }
        dump(
            dest / "schema.json",
            {
                "datasetId": group + "-v2",
                "schemaVersion": 4,
                "contentVersion": VERSION,
                "cutoff": "2025-12-31",
                "currency": "MYR",
                "moneyUnit": "cent",
                "tables": {n: metadata[n] for n in tables},
                "views": {n: views[n] for n in vs},
            },
        )
        lines = [
            f"# {group} 数据字典\n\n资源 {VERSION}。金额为整数马币分，日期为左闭右开任职区间或业务实际发生日。",
            "\n退款按原销售日期归属，截至2025-12-31。采购发票面额、批准贷项和实付分别留存。调拨发出与收货分日入账，截止日未到货保留在途，库龄为本仓入库库龄。期初库存按模型事前需求预测建立，缺货可转待处理订单，超30日未完成订单关闭。促销门槛以折前篮子金额计，活动重叠不叠加，门店、渠道、品类和会员条件同时校验。",
        ]
        for name in tables:
            m = metadata[name]
            lines += [
                "\n## " + name + "\n\n" + m["description"] + f"，{m['rowCount']} 行。",
                "\n| 字段 | 类型 | 可空 | 说明 |\n|---|---|---|---|",
            ]
            lines += [
                "| "
                + c["name"]
                + " | "
                + c["mysqlType"]
                + " | "
                + ("是" if c["nullable"] else "否")
                + " | "
                + c["description"]
                + " |"
                for c in m["columns"]
            ]
            lines += ["\n```sql\n" + m["mysqlDDL"] + "\n```"]
        for name in vs:
            lines += ["\n## " + name + "\n\n```sql\n" + views[name] + ";\n```"]
        (dest / "DATA_DICTIONARY.md").write_text("\n".join(lines) + "\n")
        # Topological table order is required when new source links reference later legacy tables.
        ordered = []
        pending = tables.copy()
        while pending:
            ready = [n for n in pending if deps(n) <= set(ordered)]
            if not ready:
                raise ValueError("Circular foreign keys " + str(pending))
            ordered += ready
            pending = [n for n in pending if n not in ready]
        with (dest / "mysql_import.sql").open("w") as out:
            out.write(
                "-- 仅导入新建空库，原生MySQL验证状态见审计报告。\nSET NAMES utf8mb4;\nSET SESSION sql_mode='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';\n"
            )
            for name in ordered:
                out.write(metadata[name]["mysqlDDL"] + "\n")
            out.write("START TRANSACTION;\n")
            for name in ordered:
                with (seed_dir / (name + ".sql")).open() as inp:
                    shutil.copyfileobj(inp, out)
            out.write("COMMIT;\n")
            for name in ordered:
                for index in indexes[name]:
                    out.write(index + ";\n")
            for name in vs:
                out.write(views[name] + ";\n")
        (dest / "README.md").write_text(
            f"# {group} 数据库\n\n审计资源版本 {VERSION}。稳定数据集ID {group}-v2。SQLite、MySQL脚本、schema.json及数据字典共同发布。\n\n来源记录与边界约定见 `DATA_DICTIONARY.md`，验证结论见资源根审计报告。\n"
        )
    dump(
        CONTENT / "question_resource/databases/manifest.json",
        {
            "version": VERSION,
            "note": "审计修复版，稳定数据集ID保留。所有派生库来自同一综合库。",
            "datasets": [
                {
                    "id": g + "-v2",
                    "path": f"databases/{g}/{g}.sqlite",
                    "sha256": v["sha256"],
                    "bytes": v["bytes"],
                }
                for g, v in groups.items()
            ],
        },
    )
    root = json.loads((CONTENT / "enterprise_reference/manifest_root.json").read_text())
    root.update(
        contentVersion=VERSION, schemaVersion=4, seed=2026111705, datasets=groups
    )
    dump(CONTENT / "enterprise_reference/manifest_root.json", root)
    for t in tasks:
        start = time.perf_counter()
        expected = query(db, t["sqliteSql"])
        t["elapsedMs"] = round((time.perf_counter() - start) * 1000, 3)
        t["expectedRowCount"] = len(expected["rows"])
        t["expectedColumns"] = expected["columns"]
        t["columns"] = expected["columns"]
        dump(
            CONTENT / f"enterprise_reference/business_tasks/results/{t['id']}.json",
            expected,
        )
        for dialect in ("mysql", "sqlite"):
            (
                CONTENT
                / f"enterprise_reference/business_tasks/{dialect}_queries/{t['id']}.sql"
            ).write_text(t[dialect + "Sql"] + ";\n")
        dump(CONTENT / f"enterprise_reference/business_tasks/{t['id']}.json", t)
    shutil.rmtree(seed_dir)
    dump(OUT / "database-export.json", groups)
    db.close()
    print("Exported seven synchronized databases and 50 task queries", flush=True)


if __name__ == "__main__":
    export()
