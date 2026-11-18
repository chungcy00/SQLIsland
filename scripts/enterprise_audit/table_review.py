"""Measured per-table mechanical-pattern review and independent campaign aggregation checks."""

from collections import Counter, defaultdict
from datetime import date, timedelta
import hashlib
import json
import math
import statistics
from repair_data import CONTENT, ORIGINAL, DBREL, OUT, ROOT, connect, dump

REVIEWS = {
    "calendar_days": (
        "保留合理周期",
        "连续自然日、月份和日序是补零及自然期间窗口的依据。",
    ),
    "stores": (
        "修复",
        "去除编号式店名，按城市配置区域配送仓，门店有稳定规模及增长差异。",
    ),
    "categories": ("保留业务主档", "15类商品分类具有语义，分类编码不是交易分布。"),
    "products": (
        "修复",
        "取消按编号循环类别及末20号停售，改为加权品类、具体商品规格和随机停售时间。",
    ),
    "customers": (
        "修复",
        "替换编号姓名，注册期、消费能力、活跃期、会员和转化倾向具有个体差异；保留未知地区。",
    ),
    "suppliers": (
        "修复",
        "替换编号名称，按业务专长建立供应目录，区域决定交期分布，供应商质量与价格有稳定差异。",
    ),
    "warehouses": ("修复", "采用具名区域仓，与门店配送及跨区域调拨运输时间关联。"),
    "departments": (
        "保留业务主档",
        "七部门是统一组织架构，员工及费用按不同业务规模分配。",
    ),
    "product_costs": (
        "修复",
        "取消整齐年度成本记录，采用各商品独立有效期、成本趋势和供应扰动。",
    ),
    "promotions": (
        "修复",
        "取消每月一场和年月模板，节庆参与概率及临时活动到达过程决定不均匀数量，允许重叠跨年。",
    ),
    "promotion_stores": (
        "新增范围约束",
        "复合主键限制活动门店组合，所选门店按地区或活动决策而定。",
    ),
    "promotion_categories": (
        "新增范围约束",
        "复合主键限制活动品类组合，节庆及清仓选择具有业务含义。",
    ),
    "traffic_sources": (
        "保留业务主档",
        "自然、搜索、社交、邮件和合作推广有明确含义；转化概率不同。",
    ),
    "marketing_campaigns": (
        "修复并保留合理周期",
        "这是渠道月度费用汇总账，不是每月一场活动；部分渠道月份停投为零，投放金额有季节与随机变化。",
    ),
    "customer_sessions": (
        "修复",
        "客户活跃区间、季节、可见促销与渠道共同影响访问，转换样本不按会话编号选择。",
    ),
    "orders": (
        "修复",
        "取消前12000号统一线上，按渠道概率和有效会话分配；门店趋势、促销曝光影响日期，旧待处理单关闭。",
    ),
    "order_items": (
        "修复",
        "取消固定订单明细数循环，采用订单级偏态篮子、长尾商品、消费能力、活动条件及历史成本。",
    ),
    "returns": (
        "修复",
        "按商品及渠道退货倾向抽样，真实延迟及部分数量，退款受原行折后金额限制。",
    ),
    "payments": (
        "修复",
        "结算精确对应有效订单，失败重试独立保留；多笔付款采用非固定拆分比例。",
    ),
    "sales_targets": (
        "保留周期并修复金额",
        "门店月目标属计划周期，金额由事前规模、趋势及预算扰动决定，不从当期实际完成额倒推。",
    ),
    "supplier_contracts": (
        "修复",
        "取消商品编号模供应商与固定年度合同，按专业目录及不等有效期间协商价格。",
    ),
    "purchase_orders": (
        "修复",
        "供应商目录、地区交期及旺季紧急概率影响日期、优先级和取消，不保留编号循环分配。",
    ),
    "purchase_order_items": (
        "修复",
        "采购行数偏态、商品取自批准目录，数量由潜在需求预测、仓库份额及个体扰动决定。",
    ),
    "goods_receipts": (
        "修复",
        "按供应商迟到/拒收倾向、部分到货和条件交期产生；不强制每单同批数。",
    ),
    "supplier_invoices": (
        "修复",
        "与采购及收货或预付条件对应，开票滞后及期限不同；重复号码只在随机供应商内部产生。",
    ),
    "supplier_invoice_items": (
        "修复",
        "由对应采购及合格收货建立，少量数量/价格差异属于待审计异常，不是主外键错误。",
    ),
    "supplier_payments": (
        "修复",
        "全额付款是正常业务类型；部分及超额比例采用连续分布，多次付款及付款延迟有差异。",
    ),
    "inventory_opening": (
        "修复",
        "按事前潜在需求和安全库存建立，未从未来最大缺口反算。",
    ),
    "inventory_snapshots": (
        "保留合理周期",
        "每月末全仓全SKU快照是明确业务粒度，数量逐笔由库存流水重建。",
    ),
    "stock_movements": (
        "修复",
        "按单据实际事件入账，销售、收货、退货、调拨、损耗均有来源键；发生频率不设每月配额。",
    ),
    "accounts": (
        "保留业务主档",
        "费用与现金科目是受控字典，不需要随机增加科目或改乱名称。",
    ),
    "journal_entries": (
        "修复",
        "费用按部门业务规模及科目分布，日期受季节和趋势影响；凭证号码作为标识不控制异常。",
    ),
    "journal_lines": (
        "保留复式关系并修复金额",
        "费用单对应借费用贷现金，两条分录是教学模型的正常平衡约束；金额按同一来源联动。",
    ),
    "bank_transactions": (
        "修复",
        "取消固定匹配比例和100笔杂项，多笔/跨期付款和随机未识别费用采用事件过程。",
    ),
    "budgets": (
        "保留合理周期",
        "部门科目月预算是正式粒度，金额按不同部门规模、科目及计划扰动生成。",
    ),
    "positions": (
        "保留业务主档",
        "五级岗位是受控职级体系，人数及晋升不按员工编号循环。",
    ),
    "employees": (
        "修复",
        "具名虚构员工，招聘、离职时间及员工效应独立抽样，不按编号触发高薪。",
    ),
    "employment_history": (
        "修复",
        "部门规模加权，任职变更概率随任职长度变化，取消固定200日调动，保留同岗调动与晋升。",
    ),
    "salary_history": (
        "保留周期并修复金额",
        "月薪属合理周期，岗位工资、员工差异、年度调整和不满月折算联动。",
    ),
    "attendance": (
        "修复",
        "不再所有人仅周一至周五，运营岗位有个人休息日、换班、周末出勤及差异加班。",
    ),
    "raw_order_import": (
        "修复隔离脏数据",
        "替换固定日期格式和编号规律，随机位置重复来源号、混合日期/货币格式、真实空值及无效文本；仅用于清洗练习。",
    ),
    "supplier_credit_notes": (
        "新增业务来源",
        "经批准价格折让按对应发票条件抽样，日期及金额具备来源约束。",
    ),
    "stock_transfers": (
        "修复运输逻辑",
        "按缺货及其他仓可用量触发，路线决定1至7日运输，保留截止日未收的在途。",
    ),
    "stock_adjustments": (
        "修复",
        "按实际库存及品类暴露抽样损耗，过期报废仅用于食品饮品。",
    ),
    "expense_documents": (
        "新增业务来源",
        "费用原始凭证与会计分录一一核对，日期金额一致。",
    ),
}


def table_stats(db, name):
    names = {
        r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    if name not in names:
        return {"rows": 0, "columns": {}}
    result = {
        "rows": db.execute("SELECT COUNT(*) FROM " + name).fetchone()[0],
        "columns": {},
    }
    for _, col, typ, *_ in db.execute("PRAGMA table_info(" + name + ")"):
        if typ.upper() not in ("TEXT", "INTEGER", "REAL"):
            continue
        count, distinct, nulls = db.execute(
            f"SELECT COUNT(*),COUNT(DISTINCT {col}),SUM({col} IS NULL) FROM {name}"
        ).fetchone()
        info = {"distinct": distinct, "nulls": nulls or 0}
        if col.endswith("date") or col in ("day", "month_key"):
            hist = db.execute(
                f"SELECT SUBSTR({col},1,7),COUNT(*) FROM {name} WHERE {col} IS NOT NULL GROUP BY 1 ORDER BY 1"
            ).fetchall()
            info["periodCounts"] = [list(row) for row in hist]
            counts = [row[1] for row in hist]
            info["nonemptyPeriodCV"] = (
                statistics.pstdev(counts) / statistics.mean(counts) if counts else None
            )
        result["columns"][col] = info
    return result


def promotions(db):
    monthly = Counter()
    promos = [dict(row) for row in db.execute("SELECT * FROM promotions")]
    for p in promos:
        monthly[p["start_date"][:7]] += 1
    months = [
        r[0]
        for r in db.execute("SELECT DISTINCT month_key FROM calendar_days ORDER BY 1")
    ]
    duration = [
        (date.fromisoformat(p["end_date"]) - date.fromisoformat(p["start_date"])).days
        + 1
        for p in promos
    ]
    pairs = [
        (a["promotion_id"], b["promotion_id"])
        for i, a in enumerate(promos)
        for b in promos[i + 1 :]
        if max(a["start_date"], b["start_date"]) <= min(a["end_date"], b["end_date"])
    ]
    return {
        "count": len(promos),
        "startsByMonth": [[m, monthly[m]] for m in months],
        "zeroStartMonths": sum(monthly[m] == 0 for m in months),
        "multipleStartMonths": sum(monthly[m] > 1 for m in months),
        "crossMonth": sum(p["start_date"][:7] != p["end_date"][:7] for p in promos),
        "crossYear": sum(p["start_date"][:4] != p["end_date"][:4] for p in promos),
        "durationMin": min(duration),
        "durationMax": max(duration),
        "overlapPairs": pairs,
        "templateNames": sum("企业主题活动" in p["promotion_name"] for p in promos),
    }


def main():
    old = connect(ORIGINAL / DBREL)
    db = connect(CONTENT / DBREL)
    names = [
        r[0]
        for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    ]
    assert set(names) == set(REVIEWS)
    review = [
        {
            "table": name,
            "decision": REVIEWS[name][0],
            "findingAndRepair": REVIEWS[name][1],
            "before": table_stats(old, name),
            "after": table_stats(db, name),
        }
        for name in names
    ]
    dump(OUT / "table-by-table.json", review)
    interim_path = ROOT / ".tooling/audit-backup-20261117/mechanical-review/enterprise-before.sqlite"
    before_interim = connect(interim_path) if interim_path.exists() else None
    interim_stats = promotions(before_interim) if before_interim else json.loads((OUT / "promotion-review.json").read_text())["intermediateBeforeFollowup"]
    promo = {
        "original": promotions(old),
        "intermediateBeforeFollowup": interim_stats,
        "after": promotions(db),
    }

    t = {name: [dict(r) for r in db.execute("SELECT * FROM " + name)] for name in names}
    stores = defaultdict(set)
    cats = defaultdict(set)
    for row in t["promotion_stores"]:
        stores[row["promotion_id"]].add(row["store_id"])
    for row in t["promotion_categories"]:
        cats[row["promotion_id"]].add(row["category_id"])
    sales = [
        dict(r)
        for r in db.execute(
            "SELECT s.*,p.category_id FROM v_sales_lines s JOIN products p USING(product_id)"
        )
    ]
    by_day = defaultdict(list)
    for row in sales:
        by_day[row["order_date"]].append(row)
    outcomes = []
    for p in t["promotions"]:

        def eligible(row):
            return (
                p["channel_scope"] in ("all", row["channel"])
                and (
                    p["store_scope"] == "all"
                    or row["store_id"] in stores[p["promotion_id"]]
                )
                and (
                    p["category_scope"] == "all"
                    or row["category_id"] in cats[p["promotion_id"]]
                )
            )

        first = max(date(2023, 1, 1), date.fromisoformat(p["start_date"]))
        last = min(date(2025, 12, 31), date.fromisoformat(p["end_date"]))
        duration = (last - first).days + 1
        current = [
            row
            for i in range(duration)
            for row in by_day[str(first + timedelta(days=i))]
            if eligible(row)
        ]
        prior = [
            row
            for i in range(duration)
            for row in by_day[str(first - timedelta(days=i + 1))]
            if eligible(row)
        ]
        linked = (
            [row for row in current if row["promotion_id"] == p["promotion_id"]]
            if current and "promotion_id" in current[0]
            else [
                dict(row)
                for row in db.execute(
                    "SELECT v.* FROM v_sales_lines v JOIN order_items i USING(order_item_id) WHERE i.promotion_id=?",
                    (p["promotion_id"],),
                )
            ]
        )
        net = sum(row["net_cents"] for row in current)
        previous = sum(row["net_cents"] for row in prior)
        profit = sum(row["net_cents"] - row["cost_cents"] for row in current)
        previous_profit = sum(row["net_cents"] - row["cost_cents"] for row in prior)
        outcomes.append(
            {
                "id": p["promotion_id"],
                "name": p["promotion_name"],
                "dates": [p["start_date"], p["end_date"]],
                "discountBasisPoints": p["discount_basis_points"],
                "modelDemandChangeBP": p["demand_change_bp"],
                "eligibleScopeSalesCents": net,
                "priorEqualLengthSalesCents": previous,
                "salesChangePct": (
                    round(100 * (net / previous - 1), 2) if previous else None
                ),
                "profitCents": profit,
                "priorProfitCents": previous_profit,
                "linkedLines": len(linked),
                "linkedNetCents": sum(row["net_cents"] for row in linked),
                "linkedGrossProfitCents": sum(
                    row["net_cents"] - row["cost_cents"] for row in linked
                ),
            }
        )
    promo["outcomes"] = outcomes
    promo["observationalComparisonLimit"] = (
        "与活动前等长窗口比较适用渠道/门店/品类的有效销售；会员和门槛只约束实际优惠关联，比较总量不作因果归因。重叠、季节、缺货及样本期边界会影响比较。"
    )
    # Independent set classification compares with both safe EXISTS and a deliberately duplicated interval join.
    online_excluded = [
        p for p in t["promotions"] if p["channel_scope"] in ("all", "store")
    ]
    flagged = {
        str(date(2025, 1, 1) + timedelta(days=i))
        for i in range(365)
        if any(
            p["start_date"]
            <= str(date(2025, 1, 1) + timedelta(days=i))
            <= p["end_date"]
            for p in online_excluded
        )
    }
    expected = sum(
        row["net_cents"]
        for row in sales
        if row["channel"] == "store" and row["order_date"] in flagged
    )
    safe = db.execute(
        "SELECT SUM(s.net_cents) FROM v_sales_lines s WHERE s.channel='store' AND s.order_date BETWEEN '2025-01-01' AND '2025-12-31' AND EXISTS(SELECT 1 FROM promotions p WHERE s.order_date BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store'))"
    ).fetchone()[0]
    naive = db.execute(
        "SELECT SUM(s.net_cents) FROM v_sales_lines s JOIN promotions p ON s.order_date BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store') WHERE s.channel='store' AND s.order_date BETWEEN '2025-01-01' AND '2025-12-31'"
    ).fetchone()[0]
    assert expected == safe and naive != safe
    promo["overlapAggregation"] = {
        "independentCents": expected,
        "safeExistsCents": safe,
        "wrongIntervalJoinCents": naive,
        "overcountCents": naive - safe,
        "pass": True,
    }
    dump(OUT / "promotion-review.json", promo)
    text = [
        "# 全业务表机械化规律复查",
        "\n资源4.2.0。45张业务表逐表复查，日历、月结及快照保留业务周期。固定随机种子2026111705；分布参数为虚构教学假设，未按真实企业样本校准。",
        "\n|表|原行数|现行数|处理|发现与修复|",
        "|---|---:|---:|---|---|",
    ]
    for row in review:
        text.append(
            f"|{row['table']}|{row['before']['rows']}|{row['after']['rows']}|{row['decision']}|{row['findingAndRepair']}|"
        )
    a = promo["after"]
    b = promo["intermediateBeforeFollowup"]
    text += [
        "\n## 促销分布",
        f"\n追查前每月一场，共{b['count']}场；现为{a['count']}场，{a['zeroStartMonths']}个月没有新活动开始，{a['multipleStartMonths']}个月多场开始。跨月{a['crossMonth']}场，跨年{a['crossYear']}场，重叠区间对{len(a['overlapPairs'])}组，时长{a['durationMin']}至{a['durationMax']}天，年月模板名{a['templateNames']}个。没有新活动开始不等于当月没有跨月活动。",
        "\n逐月活动数、每个活动折扣/销售/毛利和前期比较见promotion-review.json。",
        f"\n安全EXISTS汇总与独立程序均为{safe}分；错误区间连接得到{naive}分，多计{naive-safe}分。活动优惠通过明细上的单一promotion_id关联，避免重叠叠加。",
        f"\n在适用范围与前期等长观察窗口的描述性比较中，销售减少的活动{sum(x['salesChangePct'] is not None and x['salesChangePct']<0 for x in outcomes)}场，毛利减少的活动{sum(x['profitCents']<x['priorProfitCents'] for x in outcomes)}场。该比较受季节及重叠影响，不表示因果增量。",
        "\n## 证据与边界",
        "\n完整逐列空值/基数及按月发生数量见table-by-table.json。原始39表和修复后45表均检查，新增范围表有复合主键及外键。规则与实际分布同时审阅，不以非均匀性代替业务一致性。",
        "\n主档/凭证的稳定数字标识具有正常业务用途，不控制异常触发；隔离小型判题场景为便于核对会保留简明命名和指定边界日期。",
        "\n节庆日期依据马来西亚官方历史假期表；活动名称、优惠、窗口及效果均为虚构。",
        *[
            "\n- " + u
            for u in json.loads(
                (
                    CONTENT
                    / "enterprise_reference/structured_data/simulation_profiles.json"
                ).read_text()
            )["holidaySources"]
        ],
    ]
    report = "\n".join(text) + "\n"
    (OUT / "逐表复查.md").write_text(report)
    (CONTENT / "enterprise_reference/MECHANICAL_REVIEW.md").write_text(report)
    db.close()
    old.close()
    if before_interim:
        before_interim.close()
    print("Reviewed", len(review), "business tables; independent overlap check passed")


if __name__ == "__main__":
    main()
