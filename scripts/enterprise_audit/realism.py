"""Business-linked master data, negotiated costs and Malaysian campaign policies.
All business identities are fictional. Holiday anchors are historical government calendars.
"""

import bisect
import collections as C
import datetime as D
import math

HOLIDAYS = {
    2023: {"cny": "2023-01-22", "raya": "2023-04-22", "deepavali": "2023-11-12"},
    2024: {"cny": "2024-02-10", "raya": "2024-04-10", "deepavali": "2024-10-31"},
    2025: {"cny": "2025-01-29", "raya": "2025-03-31", "deepavali": "2025-10-20"},
}
HOLIDAY_SOURCES = [
    "https://www.kabinet.gov.my/storage/2024/11/hka_2023.pdf",
    "https://www.sabah.gov.my/gazette/docs/003045.pdf",
    "https://www.kabinet.gov.my/storage/2024/11/hka_2025.pdf",
    "https://www.sarawak.gov.my/web/home/search_result_ajax/%26search_value%3Dholiday%26sort_by%3Drelevancy?page=5",
]
STORES = [
    ("河滨生活馆", "古晋", 1),
    ("埔奕家居馆", "美里", 2),
    ("蕉赖家庭店", "吉隆坡", 3),
    ("南兰便民店", "诗巫", 1),
    ("石角社区店", "古晋", 1),
    ("滨海精选店", "美里", 2),
    ("孟沙精选馆", "吉隆坡", 3),
    ("拉让生活坊", "诗巫", 1),
    ("北区快购站", "古晋", 1),
    ("大道社区店", "美里", 2),
    ("中环居家馆", "吉隆坡", 3),
    ("福州路生活馆", "诗巫", 1),
]
PRODUCTS = {
    1: ("保湿洁面乳 轻润面霜 舒缓精华 防晒乳 柔肤水", 4000, "30ml 50ml 100ml 150ml"),
    2: (
        "衣物清洁液 浓缩洗洁精 厨房去油剂 浴室清洁剂 衣物柔顺剂",
        1500,
        "500ml 1L 1.8L 2.5L",
    ),
    3: (
        "收纳盒 棉质毛巾 遮光窗帘 防滑地垫 折叠衣架",
        5000,
        "标准款 加厚款 家庭套装 轻量款",
    ),
    4: ("椰香饼干 烘焙咖啡燕麦 香米 即食叻沙 什锦坚果", 1200, "250g 500g 1kg 分享装"),
    5: ("无糖豆奶 冷萃咖啡 热带果汁 乌龙茶 矿泉水", 800, "330ml 500ml 1L 6罐装"),
    6: (
        "中性笔 素描本 文件夹 彩色铅笔 桌面笔筒",
        600,
        "单件装 三件装 学生套装 办公套装",
    ),
    7: ("棉质上衣 休闲长裤 轻便外套 运动短袖 帆布帽", 4500, "S M L XL"),
    8: (
        "草本洗发露 温和沐浴露 口腔护理套装 护手霜 清爽止汗剂",
        1600,
        "便携装 标准装 家庭装 双支装",
    ),
    9: (
        "婴童湿巾 儿童餐具 婴童沐浴露 儿童保温杯 纱布巾",
        3500,
        "便携装 亲子套装 加量装 标准装",
    ),
    10: (
        "瑜伽垫 速干毛巾 训练弹力带 轻便水壶 羽毛球拍",
        7000,
        "入门款 进阶款 双人套装 轻量款",
    ),
    11: ("成猫粮 宠物清洁巾 宠物牵引绳 幼犬粮 宠物食盆", 2000, "小号 中号 大号 家庭装"),
    12: (
        "不粘煎锅 不锈钢汤锅 厨房刀具 硅胶锅铲 耐热保鲜盒",
        5500,
        "单件装 双件装 家用套装 轻量款",
    ),
    13: (
        "电热水壶 迷你电饭煲 桌面风扇 食物搅拌机 手持吸尘器",
        18000,
        "基础款 节能款 升级款 便携款",
    ),
    14: (
        "团圆礼盒 节庆茶礼 香氛礼盒 手工饼干礼盒 旅行礼袋",
        4500,
        "精选装 分享装 尊享装 便携装",
    ),
    15: (
        "手机支架 编织充电线 旅行收纳袋 钥匙扣 护照夹",
        1800,
        "基础款 双件装 旅行套装 耐用款",
    ),
}


def person_name(r):
    culture = r.choices(["zh", "ms", "in"], [0.43, 0.45, 0.12])[0]
    if culture == "zh":
        return r.choice("陈林黄李张吴郑刘杨王许谢钟") + r.choice(
            [
                "雅雯",
                "俊杰",
                "慧玲",
                "志豪",
                "欣怡",
                "嘉明",
                "诗敏",
                "伟伦",
                "佳颖",
                "宇轩",
                "瑞恩",
                "文静",
                "建宏",
                "丽萍",
                "思涵",
                "家豪",
                "丽君",
                "凯文",
                "心怡",
                "德明",
                "秀芬",
                "嘉欣",
                "锦华",
                "明轩",
                "可欣",
                "子豪",
            ]
        )
    if culture == "ms":
        return (
            r.choice(
                [
                    "Nur Aisyah",
                    "Amir",
                    "Farah",
                    "Izzati",
                    "Muhammad",
                    "Siti",
                    "Adam",
                    "Nadia",
                    "Hakim",
                    "Hafiz",
                    "Aina",
                    "Fatin",
                    "Syafiq",
                    "Aqil",
                    "Hana",
                    "Alia",
                    "Danish",
                ]
            )
            + " "
            + r.choice(
                [
                    "Rahman",
                    "Ibrahim",
                    "Aziz",
                    "Salleh",
                    "Ismail",
                    "Abdullah",
                    "Hamid",
                    "Zain",
                    "Omar",
                    "Faiz",
                    "Hakimi",
                    "Razak",
                    "Yusof",
                    "Idris",
                ]
            )
        )
    return (
        r.choice(
            [
                "Meena",
                "Pravin",
                "Kavitha",
                "Arun",
                "Devi",
                "Ravi",
                "Anita",
                "Suresh",
                "Lakshmi",
                "Nisha",
                "Vijay",
                "Priya",
            ]
        )
        + " "
        + r.choice(
            [
                "Kumar",
                "Rajan",
                "Anand",
                "Krishnan",
                "Nair",
                "Pillai",
                "Selvam",
                "Rao",
                "Mohan",
            ]
        )
    )


def prepare_masters(db, tables, profile, r, start, end):
    db.execute(
        "ALTER TABLE stores ADD COLUMN fulfillment_warehouse_id INTEGER REFERENCES warehouses(warehouse_id)"
    )
    db.execute("ALTER TABLE products ADD COLUMN discontinued_date TEXT")
    db.execute("ALTER TABLE customers ADD COLUMN member_since_date TEXT")
    db.execute("ALTER TABLE orders ADD COLUMN cancellation_reason TEXT")
    for row, (name, city, warehouse) in zip(tables["stores"], STORES):
        row.update(store_name=name, city=city, fulfillment_warehouse_id=warehouse)
    for row, name in zip(
        tables["warehouses"],
        ["古晋区域配送中心", "美里区域配送仓", "吉隆坡电商与门店仓"],
    ):
        row["warehouse_name"] = name
    for row in tables["customers"]:
        row.update(customer_name=person_name(r), member_since_date=None)
    for row in tables["employees"]:
        row["employee_name"] = person_name(r)
    prefixes = [
        "Borneo",
        "Mutiara",
        "Seri Alam",
        "Kencana",
        "Nusa",
        "Kenari",
        "Cahaya",
        "Kinabalu",
        "Meranti",
        "Bayu",
        "Awan",
        "Rimba",
        "Pelangi",
        "Sutra",
        "Tanjung",
        "Sentosa",
    ]
    specialties = [
        "Homeware",
        "Food Supply",
        "Personal Care",
        "Packaging",
        "Lifestyle",
        "Pantry",
        "Household",
        "Retail Distribution",
        "Kitchenware",
        "Grocery",
    ]
    taken = set()
    for row in tables["suppliers"]:
        while True:
            name = (
                r.choice(prefixes)
                + " "
                + r.choice(specialties)
                + " "
                + r.choice(["Sdn Bhd", "Enterprise", "Trading", "Resources"])
            )
            if name not in taken:
                break
        taken.add(name)
        row["supplier_name"] = name
    popularity = {p["product_id"]: r.paretovariate(1.4) for p in tables["products"]}
    popsum = sum(popularity.values())
    discontinued = set(r.sample(list(popularity), r.randint(14, 29)))
    cost_rows = []
    histories = {}
    name_counts = C.Counter()
    for p in tables["products"]:
        pid = p["product_id"]
        category = r.choices(
            list(PRODUCTS), weights=[8, 8, 10, 15, 10, 7, 6, 7, 3, 3, 5, 5, 3, 4, 6]
        )[0]
        names, base, sizes = PRODUCTS[category]
        brand = r.choice(
            ["禾沐", "Bumi", "Luma", "Rimba", "青禾", "Murni", "Bela", "Nusa"]
        )
        name = brand + " " + r.choice(names.split()) + " " + r.choice(sizes.split())
        # SKU variants may share a product family, but names carry specifications instead of row IDs.
        if name_counts[name]:
            name += " " + r.choice(["经典版", "清新款", "原色款", "简约版"])
        name_counts[name] += 1
        price = max(200, round(base * r.lognormvariate(0, 0.48) / 10) * 10)
        ratio = min(0.91, max(0.30, r.betavariate(5, 5) * 0.65 + 0.23))
        growth = r.uniform(-0.015, 0.075)
        disc = (
            str(start + D.timedelta(days=r.randint(500, (end - start).days)))
            if pid in discontinued
            else None
        )
        p.update(
            category_id=category,
            product_name=name,
            list_price_cents=price,
            active=int(disc is None),
            discontinued_date=disc,
        )
        pp = {
            "popularity": popularity[pid],
            "price": price,
            "costRatio": ratio,
            "costGrowth": growth,
            "promoSensitivity": r.betavariate(2, 2),
            "safetyDays": r.randint(7, 32),
            "discontinuedDate": disc,
            "category": category,
        }
        profile["products"][pid] = pp
        p["reorder_level"] = max(
            2, round(270000 / 1096 * popularity[pid] / popsum * pp["safetyDays"])
        )
        effective = start
        history = []
        previous = round(price * ratio)
        while effective <= end:
            cost = (
                max(
                    1,
                    round(
                        previous
                        * (1 + growth * (r.randint(90, 270) / 365))
                        * r.lognormvariate(0, 0.025)
                    ),
                )
                if history
                else previous
            )
            history.append((str(effective), cost))
            cost_rows.append(
                dict(
                    cost_id=len(cost_rows) + 1,
                    product_id=pid,
                    effective_date=str(effective),
                    unit_cost_cents=cost,
                )
            )
            previous = cost
            effective += D.timedelta(
                days=max(45, round(r.lognormvariate(math.log(170), 0.42)))
            )
        histories[pid] = history
    tables["product_costs"] = cost_rows

    def cost_at(pid, day):
        history = histories[pid]
        index = bisect.bisect_right([entry[0] for entry in history], str(day)) - 1
        return history[index][1]

    return popularity, popsum, cost_at


def campaigns(db, tables, profile, r, start, end):
    for definition in [
        "campaign_type TEXT NOT NULL DEFAULT 'festive'",
        "channel_scope TEXT NOT NULL DEFAULT 'all'",
        "store_scope TEXT NOT NULL DEFAULT 'all'",
        "category_scope TEXT NOT NULL DEFAULT 'all'",
        "members_only INTEGER NOT NULL DEFAULT 0",
        "min_basket_cents INTEGER NOT NULL DEFAULT 0",
        "discount_basis_points INTEGER NOT NULL DEFAULT 0",
        "demand_change_bp INTEGER NOT NULL DEFAULT 0",
    ]:
        db.execute("ALTER TABLE promotions ADD COLUMN " + definition)
    db.execute(
        "CREATE TABLE promotion_stores(promotion_id INTEGER NOT NULL REFERENCES promotions(promotion_id),store_id INTEGER NOT NULL REFERENCES stores(store_id),PRIMARY KEY(promotion_id,store_id))"
    )
    db.execute(
        "CREATE TABLE promotion_categories(promotion_id INTEGER NOT NULL REFERENCES promotions(promotion_id),category_id INTEGER NOT NULL REFERENCES categories(category_id),PRIMARY KEY(promotion_id,category_id))"
    )
    rows = []
    store_rows = []
    category_rows = []
    sarawak = [s["store_id"] for s in tables["stores"] if s["city"] != "吉隆坡"]
    kl = [s["store_id"] for s in tables["stores"] if s["city"] == "吉隆坡"]

    def add(
        name,
        first,
        days,
        kind,
        categories=None,
        stores=None,
        channel="all",
        members=False,
    ):
        rate = {
            "festive": (400, 1900),
            "member": (300, 1400),
            "clearance": (1800, 4500),
            "flash": (500, 2300),
            "seasonal": (300, 1500),
        }[kind]
        discount = round(r.triangular(*rate, (rate[0] + rate[1]) * 0.45) / 50) * 50
        row = dict(
            promotion_id=len(rows) + 1,
            promotion_name=name,
            start_date=str(first),
            end_date=str(first + D.timedelta(days=days - 1)),
            campaign_type=kind,
            channel_scope="store" if stores else channel,
            store_scope="selected" if stores else "all",
            category_scope="selected" if categories else "all",
            members_only=int(members),
            min_basket_cents=r.choice([0, 0, 5000, 10000, 15000, 25000]),
            discount_basis_points=discount,
            demand_change_bp=max(-3500, min(8000, round(r.gauss(1300, 2600)))),
        )
        rows.append(row)
        for sid in stores or []:
            store_rows.append(dict(promotion_id=row["promotion_id"], store_id=sid))
        for cid in categories or []:
            category_rows.append(
                dict(promotion_id=row["promotion_id"], category_id=cid)
            )

    for year in range(start.year, end.year + 1):
        dates = HOLIDAYS[year]
        choices = [
            (
                dates["cny"],
                ["新春年货礼遇", "团圆年货与茶礼", "新春年货精选"],
                [4, 5, 14],
                None,
                0.88,
            ),
            (
                dates["raya"],
                ["开斋节家庭焕新", "Raya佳节团聚礼遇", "Raya厨房焕新"],
                [3, 4, 7, 8],
                None,
                0.90,
            ),
            (
                f"{year}-06-01",
                ["Gawai丰收节好物", "砂拉越丰收团圆礼盒", "丰收季家庭精选"],
                [4, 5, 14],
                sarawak,
                0.78,
            ),
            (f"{year}-08-31", ["国庆本地好物", "Merdeka生活精选"], None, None, 0.68),
            (
                f"{year}-09-16",
                ["马来西亚日家庭惠购", "邻里共享好物节"],
                [3, 4, 5, 12],
                None,
                0.62,
            ),
            (
                dates["deepavali"],
                ["屠妖节灯彩家居礼遇", "Deepavali馈赠精选"],
                [3, 7, 14],
                kl,
                0.64,
            ),
        ]
        for anchor, names, categories, stores, probability in choices:
            if r.random() > probability:
                continue
            day = D.date.fromisoformat(anchor)
            first = day - D.timedelta(days=r.randint(5, 22))
            add(
                r.choice(names), first, r.randint(10, 31), "festive", categories, stores
            )
        if r.random() < 0.82:
            add(
                r.choice(
                    ["年末馈赠与新年礼遇", "圣诞好礼与新年精选", "跨年居家焕新季"]
                ),
                D.date(year, 12, r.randint(12, 24)),
                r.randint(18, 35),
                "seasonal",
                [3, 13, 14],
            )
    # Ad-hoc activity is an arrival process driven by business type, not monthly quotas.
    cursor = start + D.timedelta(days=r.randint(3, 35))
    while cursor <= end:
        kind = r.choices(
            ["member", "clearance", "flash", "seasonal"], [0.32, 0.22, 0.30, 0.16]
        )[0]
        if kind == "member":
            name = r.choice(["会员加享好物", "会员专属补给礼遇", "熟客回馈精选"])
            duration = r.randint(2, 6)
            cats = None
        elif kind == "clearance":
            name = r.choice(["家居换季清仓", "尾货精选出清", "陈列更换特惠"])
            duration = r.randint(9, 27)
            cats = r.sample([3, 7, 10, 12, 13, 15], r.randint(1, 3))
        elif kind == "flash":
            name = r.choice(["限日精选优惠", "快闪惠购精选", "限日好物精选"])
            duration = r.choice([1, 2, 3, 4])
            cats = r.sample(list(PRODUCTS), r.randint(1, 4))
        else:
            name = r.choice(["雨季居家补给", "家庭囤货精选", "厨房焕新周"])
            duration = r.randint(7, 19)
            cats = r.sample([2, 3, 4, 8, 12], r.randint(1, 3))
        selected = (
            r.sample([s["store_id"] for s in tables["stores"]], r.randint(2, 6))
            if r.random() < 0.3
            else None
        )
        add(
            name,
            cursor,
            duration,
            kind,
            cats,
            selected,
            channel="online" if kind == "flash" and r.random() < 0.6 else "all",
            members=kind == "member",
        )
        cursor += D.timedelta(days=max(3, round(r.expovariate(1 / r.uniform(30, 64)))))
    tables["promotions"] = rows
    tables["promotion_stores"] = store_rows
    tables["promotion_categories"] = category_rows
    scope_stores = C.defaultdict(set)
    scope_categories = C.defaultdict(set)
    for row in store_rows:
        scope_stores[row["promotion_id"]].add(row["store_id"])
    for row in category_rows:
        scope_categories[row["promotion_id"]].add(row["category_id"])
    profile["holidaySources"] = HOLIDAY_SOURCES
    profile["promotionRules"] = (
        "门槛以订单折扣前篮子金额计；重叠活动不叠加，一条明细最多一个活动；区域、渠道、品类与会员条件须同时满足。效果参数可为负。"
    )
    return rows, scope_stores, scope_categories


def eligible_promotion(
    p,
    day,
    channel,
    store,
    category,
    member_since,
    basket,
    scope_stores,
    scope_categories,
):
    return (
        p["start_date"] <= str(day) <= p["end_date"]
        and p["channel_scope"] in ("all", channel)
        and (p["store_scope"] == "all" or store in scope_stores[p["promotion_id"]])
        and (
            p["category_scope"] == "all"
            or category in scope_categories[p["promotion_id"]]
        )
        and (
            not p["members_only"]
            or (member_since is not None and member_since <= str(day))
        )
        and basket >= p["min_basket_cents"]
    )


def prepare_purchases(
    db, tables, profile, r, start, end, cost_at, choose_date, popularity, popsum, stores
):
    db.execute(
        "ALTER TABLE purchase_orders ADD COLUMN order_priority TEXT NOT NULL DEFAULT 'normal'"
    )
    db.execute("ALTER TABLE purchase_orders ADD COLUMN cancellation_date TEXT")
    suppliers = {s["supplier_id"]: s for s in tables["suppliers"]}
    sp = {}
    for sid, supplier in suppliers.items():
        supplier["region"] = r.choices(["本地", "区域", "海外"], [0.5, 0.32, 0.18])[0]
        median = {"本地": 6, "区域": 16, "海外": 35}[supplier["region"]]
        focus = r.sample(range(1, 16), r.randint(2, 6))
        name = supplier["supplier_name"]
        if "Food" in name or "Grocery" in name or "Pantry" in name:
            focus = [4, 5, 14]
        elif "Homeware" in name or "Kitchenware" in name:
            focus = [3, 12, 13]
        elif "Personal Care" in name:
            focus = [1, 8, 9]
        sp[sid] = {
            "priceFactor": r.lognormvariate(0, 0.065),
            "leadDays": max(2, round(r.lognormvariate(math.log(median), 0.2))),
            "lateProbability": r.betavariate(2, 6),
            "rejectProbability": r.betavariate(1, 35),
            "share": r.lognormvariate(0, 0.65),
            "categoryFocus": focus,
        }
    profile["suppliers"] = sp
    products = {p["product_id"]: p for p in tables["products"]}
    contracts = []
    catalog = C.defaultdict(list)
    contract_map = {}
    for pid, product in products.items():
        count = r.choices([1, 2, 3], [0.12, 0.64, 0.24])[0]
        eligible = list(suppliers)
        approved = []
        for _ in range(count):
            sid = r.choices(
                eligible,
                weights=[
                    sp[s]["share"]
                    * (3 if product["category_id"] in sp[s]["categoryFocus"] else 0.15)
                    for s in eligible
                ],
            )[0]
            approved.append(sid)
            eligible.remove(sid)
        for sid in approved:
            catalog[sid].append(pid)
            history = []
            first = start
            previous = None
            while first <= end:
                length = max(90, round(r.lognormvariate(math.log(285), 0.35)))
                last = first + D.timedelta(days=length - 1)
                quote = round(
                    cost_at(pid, first)
                    * sp[sid]["priceFactor"]
                    * r.lognormvariate(0, 0.025)
                )
                if previous is not None:
                    quote = round(0.35 * previous + 0.65 * quote)
                contract = dict(
                    contract_id=len(contracts) + 1,
                    supplier_id=sid,
                    product_id=pid,
                    start_date=str(first),
                    end_date=str(last),
                    unit_price_cents=max(1, quote),
                )
                contracts.append(contract)
                history.append(contract)
                previous = quote
                first = last + D.timedelta(days=1)
            contract_map[sid, pid] = history
    tables["supplier_contracts"] = contracts
    supplier_ids = list(catalog)
    weights = [
        sp[s]["share"] * sum(popularity[p] for p in catalog[s]) for s in supplier_ids
    ]
    po_map = {p["po_id"]: p for p in tables["purchase_orders"]}
    for po in po_map.values():
        sid = r.choices(supplier_ids, weights=weights)[0]
        p = sp[sid]
        day = choose_date(trend=0.10)
        urgent = r.random() < (
            0.04 + 0.12 * p["lateProbability"] + (0.08 if day.month in (11, 12) else 0)
        )
        lead = max(
            1,
            round(
                r.lognormvariate(
                    math.log(p["leadDays"] * (0.65 if urgent else 1)), 0.20
                )
            ),
        )
        status = (
            "cancelled" if r.random() < 0.02 + 0.07 * p["lateProbability"] else "placed"
        )
        po.update(
            supplier_id=sid,
            warehouse_id=r.choices([1, 2, 3], [0.34, 0.21, 0.45])[0],
            order_date=str(day),
            promised_date=str(day + D.timedelta(days=lead)),
            status=status,
            order_priority="urgent" if urgent else "normal",
            cancellation_date=(
                str(min(end, day + D.timedelta(days=r.randint(2, 18))))
                if status == "cancelled"
                else None
            ),
        )
    # Keep the total line budget, with a mandatory first line and a skewed order-specific basket size.
    ids = list(po_map)
    extra = len(tables["purchase_order_items"]) - len(ids)
    po_weights = [r.lognormvariate(0, 0.9) for _ in ids]
    parents = ids + r.choices(ids, weights=po_weights, k=extra)
    r.shuffle(parents)
    for item, poid in zip(tables["purchase_order_items"], parents):
        po = po_map[poid]
        sid = po["supplier_id"]
        pid = r.choices(catalog[sid], weights=[popularity[p] for p in catalog[sid]])[0]
        item.update(po_id=poid, product_id=pid)
    pi_map = {p["po_item_id"]: p for p in tables["purchase_order_items"]}
    pair_lines = C.Counter(
        (po_map[i["po_id"]]["warehouse_id"], i["product_id"]) for i in pi_map.values()
    )
    store_ware = C.Counter()
    for sid, p in profile["stores"].items():
        store_ware[stores[sid]["fulfillment_warehouse_id"]] += p["scale"]
    total_scale = sum(store_ware.values())
    ware_share = {
        w: 0.6 * store_ware[w] / total_scale + (0.4 if w == 3 else 0) for w in [1, 2, 3]
    }
    receipts = []
    by_pi = C.defaultdict(list)
    for item in pi_map.values():
        po = po_map[item["po_id"]]
        sid = po["supplier_id"]
        p = sp[sid]
        pid = item["product_id"]
        day = D.date.fromisoformat(po["order_date"])
        contract = next(
            c
            for c in contract_map[sid, pid]
            if c["start_date"] <= str(day) <= c["end_date"]
        )
        forecast = 200000 * popularity[pid] / popsum * ware_share[po["warehouse_id"]]
        quantity = max(
            2,
            round(
                forecast
                / max(1, pair_lines[po["warehouse_id"], pid])
                * r.lognormvariate(0.05, 0.48)
            ),
        )
        deviation = 0
        if po["order_priority"] == "urgent":
            deviation = r.uniform(0.015, 0.14)
        elif r.random() < 0.22:
            deviation = (
                -r.betavariate(2, 5) * 0.06
                if quantity >= 35
                else r.uniform(-0.015, 0.025)
            )
        price = max(1, round(contract["unit_price_cents"] * (1 + deviation)))
        item.update(
            contract_id=contract["contract_id"],
            quantity_ordered=quantity,
            unit_price_cents=price,
        )
        if po["status"] == "cancelled":
            continue
        first = (
            max(1, round(quantity * r.uniform(0.25, 0.8)))
            if r.random() < 0.12 + 0.40 * p["lateProbability"]
            else quantity
        )
        promised = D.date.fromisoformat(po["promised_date"])
        late = r.random() < p["lateProbability"]
        rd = max(
            day,
            promised
            + D.timedelta(
                days=(
                    r.randint(1, 20)
                    if late
                    else -r.randint(0, min(4, (promised - day).days))
                )
            ),
        )
        for index, qty in enumerate([first, quantity - first]):
            date = rd + D.timedelta(days=0 if not index else r.randint(2, 17))
            if not qty or date > end or (index and r.random() < 0.22):
                continue
            rejected = (
                min(qty, max(1, round(qty * r.betavariate(2, 10))))
                if r.random() < p["rejectProbability"] * 5
                else 0
            )
            row = dict(
                receipt_id=len(receipts) + 1,
                po_item_id=item["po_item_id"],
                receipt_date=str(date),
                quantity_received=qty,
                quantity_rejected=rejected,
            )
            receipts.append(row)
            by_pi[item["po_item_id"]].append(row)
    tables["goods_receipts"] = receipts
    invoices = []
    invoice_items = []
    payments = []
    credits = []
    items_by_po = C.defaultdict(list)
    for item in pi_map.values():
        items_by_po[item["po_id"]].append(item)
    for po in po_map.values():
        line_goods = [
            (
                i,
                sum(
                    g["quantity_received"] - g["quantity_rejected"]
                    for g in by_pi[i["po_item_id"]]
                ),
            )
            for i in items_by_po[po["po_id"]]
        ]
        advance = po["status"] != "cancelled" and r.random() < 0.06
        if not any(qty for _, qty in line_goods) and not advance:
            continue
        day = min(
            end,
            D.date.fromisoformat(po["order_date"]) + D.timedelta(days=r.randint(5, 35)),
        )
        if not advance:
            received_dates = [g["receipt_date"] for pi,_ in line_goods for g in by_pi[pi["po_item_id"]]]
            if received_dates:
                day = max(day, D.date.fromisoformat(max(received_dates)))
        invoice = dict(
            supplier_invoice_id=len(invoices) + 1,
            po_id=po["po_id"],
            invoice_no=f"INV-{r.getrandbits(40):010X}",
            invoice_date=str(day),
            due_date=str(day + D.timedelta(days=r.choice([15, 30, 45, 60]))),
        )
        invoices.append(invoice)
        bill = 0
        for pi, got in line_goods:
            if not got and not advance:
                continue
            qty = max(
                1,
                (pi["quantity_ordered"] if advance else got)
                + (r.randint(1, 3) if r.random() < 0.045 else 0),
            )
            price = pi["unit_price_cents"] + (
                r.randint(10, 250) if r.random() < 0.035 else 0
            )
            invoice_items.append(
                dict(
                    supplier_invoice_item_id=len(invoice_items) + 1,
                    supplier_invoice_id=invoice["supplier_invoice_id"],
                    po_item_id=pi["po_item_id"],
                    quantity_billed=qty,
                    unit_price_cents=price,
                )
            )
            bill += qty * price
        if r.random() < 0.035:
            credits.append(
                dict(
                    credit_note_id=len(credits) + 1,
                    supplier_invoice_id=invoice["supplier_invoice_id"],
                    credit_date=str(min(end, day + D.timedelta(days=r.randint(1, 15)))),
                    amount_cents=max(1, round(bill * r.betavariate(2, 12) * 0.5)),
                    reason="价格折让或采购贷项调整",
                )
            )
        pd = day + D.timedelta(days=max(1, round(r.lognormvariate(math.log(18), 0.65))))
        if (
            pd > end
            or r.random() < 0.12 + 0.1 * sp[po["supplier_id"]]["lateProbability"]
        ):
            continue
        case = r.choices(["full", "partial", "over"], [0.68, 0.28, 0.04])[0]
        ratio = (
            1
            if case == "full"
            else (
                r.uniform(0.12, 0.88)
                if case == "partial"
                else 1 + r.uniform(0.003, 0.18)
            )
        )
        approved_credit = sum(c["amount_cents"] for c in credits if c["supplier_invoice_id"] == invoice["supplier_invoice_id"] and c["credit_date"] <= str(pd))
        remaining = max(1, round((bill - approved_credit) * ratio))
        parts = r.choices([1, 2, 3, 4], [0.62, 0.25, 0.10, 0.03])[0]
        for index in range(parts):
            date = pd + D.timedelta(
                days=(
                    0
                    if not index
                    else max(1, round(r.lognormvariate(math.log(9 * index), 0.35)))
                )
            )
            if date > end:
                break
            amount = (
                remaining
                if index == parts - 1
                else max(1, round(remaining * r.uniform(0.25, 0.7)))
            )
            remaining -= amount
            payments.append(
                dict(
                    supplier_payment_id=len(payments) + 1,
                    supplier_invoice_id=invoice["supplier_invoice_id"],
                    payment_date=str(date),
                    amount_cents=amount,
                )
            )
    by_supplier = C.defaultdict(list)
    for inv in invoices:
        by_supplier[po_map[inv["po_id"]]["supplier_id"]].append(inv)
    for sid, items in by_supplier.items():
        if len(items) >= 2 and r.random() < min(0.5, len(items) * 0.002):
            a, b = r.sample(items, 2)
            b["invoice_no"] = a["invoice_no"]
    tables.update(
        supplier_invoices=invoices,
        supplier_invoice_items=invoice_items,
        supplier_payments=payments,
    )
    return po_map, pi_map, receipts, credits, ware_share
