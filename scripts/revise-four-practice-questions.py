"""Apply the four question rewrites explicitly specified by the course revision."""
from pathlib import Path
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import copy
import hashlib
import importlib.util
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
Q = ROOT / 'resources/CONTENT/question_resource'
VERSION = '5.0.0'
REVISION = 'curriculum-20261119'

def load(path):
    return json.loads(path.read_text())

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

DEFINITIONS = {
    'q0265': {
        'title': '客户复购率', 'kp': 'kp19-03',
        'context': '电商运营需要评估2025年发生有效购买的客户是否再次购买。',
        'requirements': '统计2025-01-01至2025-12-31的线上有效购买。有效订单须为completed，按订单日期归属，并扣除截至2025-12-31确认的退款后净销售额大于0。只统计customers中存在且customer_id非空的客户。每个客户按不同order_id计购买次数，同一订单的多条明细只算一次。输出一行，purchasing_customers为至少购买一次的去重客户数，repeat_customers为至少购买两次的去重客户数，repeat_pct=100.0*repeat_customers/purchasing_customers，四舍五入2位小数，零分母返回NULL。',
        'grain': '分析期间全部有效购买客户汇总为一行',
        'columns': ['purchasing_customers', 'repeat_customers', 'repeat_pct'],
        'sourceTables': ['customers', 'v_order_net'],
        'sql': """WITH purchases AS (
  SELECT c.customer_id, COUNT(DISTINCT o.order_id) purchase_count
  FROM customers c JOIN v_order_net o ON o.customer_id=c.customer_id
  WHERE o.channel='online' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31'
    AND o.net_cents>0
  GROUP BY c.customer_id
)
SELECT COUNT(*) AS purchasing_customers,
  COALESCE(SUM(CASE WHEN purchase_count>=2 THEN 1 ELSE 0 END),0) AS repeat_customers,
  ROUND(100.0*COALESCE(SUM(CASE WHEN purchase_count>=2 THEN 1 ELSE 0 END),0)/NULLIF(COUNT(*),0),2) AS repeat_pct
FROM purchases""",
        'equivalent': """WITH purchases AS (
 SELECT c.customer_id, COUNT(DISTINCT o.order_id) n
 FROM customers c JOIN v_order_net o ON c.customer_id=o.customer_id
 WHERE o.channel='online' AND o.order_date>='2025-01-01' AND o.order_date<'2026-01-01' AND o.net_cents>0
 GROUP BY c.customer_id
), totals AS (SELECT COUNT(*) buyers,COUNT(CASE WHEN n>1 THEN 1 END) repeaters FROM purchases)
SELECT buyers purchasing_customers,repeaters repeat_customers,ROUND(100.0*repeaters/NULLIF(buyers,0),2) repeat_pct FROM totals""",
        'hints': ['先使用订单粒度净额视图过滤期间、渠道及非正净额订单。', '按客户统计不同订单数，再将客户汇总为总购买人数与复购人数。', '复购率分母是有效购买客户数，不能使用注册客户数或订单数。'],
        'explanation': 'v_order_net已将订单明细汇总，并在明细层预先汇总多次退款，避免连接后重复计数。先筛选2025年线上正净额订单，再按客户计不同订单数。第二层汇总把粒度从客户改为全体购买客户，条件计数得到至少两次购买的人数。没有购买客户时两个计数均为0，复购率为NULL。',
        'steps': ['筛选有效线上购买', '按客户计不同订单', '统计购买及复购人数', '计算客户复购率'],
    },
    'q0288': {
        'title': '多表汇总与销售贡献率', 'kp': 'kp20-01',
        'context': '管理层需要比较2025年各门店在全体线下净销售中的贡献。',
        'requirements': '连接stores与订单粒度视图v_order_net，统计2025-01-01至2025-12-31的线下有效订单。视图仅含completed订单，净额已扣除截至2025-12-31确认的退款，并归属原订单日期。金额为马币分。每个门店一行，保留无销售门店并将其net_cents置0。sales_pct=100.0*该门店净销售额/全部stores门店在相同期间的线下净销售额，四舍五入2位小数，全体净销售为0时返回NULL。使用窗口求和计算总体分母。按net_cents降序、store_id升序排序。',
        'grain': '每门店一行', 'columns': ['store_id', 'net_cents', 'sales_pct'],
        'sourceTables': ['stores', 'v_order_net'],
        'sql': """WITH totals AS (
 SELECT s.store_id, COALESCE(SUM(o.net_cents),0) net_cents
 FROM stores s LEFT JOIN v_order_net o ON o.store_id=s.store_id
  AND o.channel='store' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31'
 GROUP BY s.store_id
)
SELECT store_id,net_cents,ROUND(100.0*net_cents/NULLIF(SUM(net_cents) OVER(),0),2) sales_pct
FROM totals ORDER BY net_cents DESC,store_id""",
        'equivalent': """WITH sales AS (
 SELECT store_id,SUM(net_cents) amount FROM v_order_net
 WHERE channel='store' AND order_date>='2025-01-01' AND order_date<'2026-01-01' GROUP BY store_id
), totals AS (SELECT s.store_id,COALESCE(a.amount,0) net_cents FROM stores s LEFT JOIN sales a ON s.store_id=a.store_id)
SELECT store_id,net_cents,ROUND(net_cents*100.0/NULLIF(SUM(net_cents) OVER(),0),2) sales_pct FROM totals ORDER BY net_cents DESC,store_id ASC""",
        'hints': ['以stores为保留侧，日期和渠道条件放在关联条件或预聚合子查询中。', '先按store_id汇总，窗口SUM再作用于每门店一行的结果。', '总体净销售额作为所有门店共同分母，用NULLIF处理零值并补充store_id决胜排序。'],
        'explanation': '订单视图一行代表一笔有效订单。左连接保留无订单门店，先按门店聚合才得到可比较的门店净销售。SUM(net_cents) OVER()在全部门店汇总行上求和，每行仍保留门店粒度。窗口内不分区，避免每店贡献率都等于100%。线上订单不归入线下门店总体，不能混入分母。',
        'steps': ['关联门店及有效订单', '按门店汇总净销售', '窗口计算总体净销售', '计算贡献并排序'],
    },
    'q0290': {
        'title': '月度销售趋势与缺失月份', 'kp': 'kp20-02',
        'context': '管理层需要2025年完整12个月的线下净销售趋势，包括没有销售的月份。',
        'requirements': '从calendar_days取得2025-01至2025-12的12个不同month_key。汇总同期v_order_net中channel=store的订单净销售额。视图仅含completed订单，净额已扣除截至2025-12-31确认的退款，并归属原订单日期，金额为马币分。左连接补齐月份，无销售月份net_cents填0，再对连续月份使用LAG计算previous_net_cents和change_cents=net_cents-previous_net_cents。change_pct=100.0*change_cents/previous_net_cents，四舍五入2位小数，上一月为0时返回NULL。1月的三个上月及变化字段均为NULL，不读取2024年。每月一行，按month_key升序。不使用递归查询。',
        'grain': '2025年每自然月一行，共12行',
        'columns': ['month_key', 'net_cents', 'previous_net_cents', 'change_cents', 'change_pct'],
        'sourceTables': ['calendar_days', 'v_order_net'],
        'sql': """WITH months AS (
 SELECT DISTINCT month_key FROM calendar_days WHERE month_key BETWEEN '2025-01' AND '2025-12'
), sales AS (
 SELECT SUBSTR(order_date,1,7) month_key,SUM(net_cents) net_cents FROM v_order_net
 WHERE channel='store' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY SUBSTR(order_date,1,7)
), complete AS (
 SELECT m.month_key,COALESCE(s.net_cents,0) net_cents FROM months m LEFT JOIN sales s ON m.month_key=s.month_key
), previous AS (
 SELECT month_key,net_cents,LAG(net_cents) OVER(ORDER BY month_key) previous_net_cents FROM complete
)
SELECT month_key,net_cents,previous_net_cents,net_cents-previous_net_cents change_cents,
 ROUND(100.0*(net_cents-previous_net_cents)/NULLIF(previous_net_cents,0),2) change_pct
FROM previous ORDER BY month_key""",
        'equivalent': """WITH complete AS (
 SELECT m.month_key,COALESCE(SUM(o.net_cents),0) net_cents
 FROM (SELECT DISTINCT month_key FROM calendar_days WHERE month_key>='2025-01' AND month_key<'2026-01') m
 LEFT JOIN v_order_net o ON SUBSTR(o.order_date,1,7)=m.month_key AND o.channel='store'
 GROUP BY m.month_key
), previous AS (
 SELECT month_key,net_cents,LAG(net_cents,1) OVER(ORDER BY month_key) previous_net_cents FROM complete
)
SELECT month_key,net_cents,previous_net_cents,net_cents-previous_net_cents change_cents,
 ROUND((net_cents-previous_net_cents)*100.0/NULLIF(previous_net_cents,0),2) change_pct FROM previous ORDER BY month_key""",
        'hints': ['先取日期维度的不同月份，避免同一月的多天重复连接。', '销售先汇总再左连接月份，补0之后再计算LAG。', '首月没有分析范围内的上月，保持NULL；上月为0时变化金额仍可计算，变化百分比为NULL。'],
        'explanation': '缺失销售记录的月份若直接省略，LAG得到的会是上一条有销售记录，与上一个自然月不同。日期维度先提供12个连续月份，左连接并补0后，每行的上一条才对应相邻月份。先完成月份再开窗，同时保留2025年1月上月值为NULL。上月为0与未知上月具有不同业务含义，但两者都不能直接作为除法分母。',
        'steps': ['取得连续12个月', '汇总线下订单净销售', '左连接月份并补零', '计算相邻月份变化'],
    },
    'q0255': {
        'title': '各门店销售额前三名商品', 'kp': 'kp20-03',
        'context': '商品经理需要2025年每家门店净销售额最高的最多三件商品。',
        'requirements': '统计2025-01-01至2025-12-31的线下有效销售明细v_sales_lines。视图仅含completed订单，净额已扣除截至2025-12-31确认的退款，并归属原订单日期，金额为马币分。先按store_id、product_id汇总net_cents，仅纳入汇总净销售额大于0的商品。使用ROW_NUMBER按门店分区、net_cents降序及product_id升序编号，选取编号不超过3的商品。同额商品按product_id确定先后，每门店最多3行；不足3件返回实际存在的商品，无正净销售门店不返回行。按store_id、sales_rank升序输出。',
        'grain': '每门店每入选商品一行', 'columns': ['store_id', 'product_id', 'net_cents', 'sales_rank'],
        'sourceTables': ['v_sales_lines'],
        'sql': """WITH sales AS (
 SELECT store_id,product_id,SUM(net_cents) net_cents FROM v_sales_lines
 WHERE channel='store' AND order_date BETWEEN '2025-01-01' AND '2025-12-31'
 GROUP BY store_id,product_id HAVING SUM(net_cents)>0
), ranked AS (
 SELECT store_id,product_id,net_cents,ROW_NUMBER() OVER(PARTITION BY store_id ORDER BY net_cents DESC,product_id) sales_rank FROM sales
)
SELECT store_id,product_id,net_cents,sales_rank FROM ranked WHERE sales_rank<=3 ORDER BY store_id,sales_rank""",
        'equivalent': """WITH sales AS (
 SELECT store_id,product_id,SUM(net_cents) net_cents FROM v_sales_lines
 WHERE channel='store' AND order_date>='2025-01-01' AND order_date<'2026-01-01'
 GROUP BY store_id,product_id HAVING SUM(net_cents)>0
), ranked AS (
 SELECT sales.*,ROW_NUMBER() OVER(PARTITION BY store_id ORDER BY net_cents DESC,product_id ASC) sales_rank FROM sales
)
SELECT store_id,product_id,net_cents,sales_rank FROM ranked WHERE sales_rank<4 ORDER BY store_id ASC,sales_rank ASC""",
        'hints': ['先按门店和商品聚合，移除净额不大于0的商品组。', 'ROW_NUMBER按store_id分区，按net_cents降序及product_id升序编号。', '窗口别名在外层筛选sales_rank<=3，最终输出按门店和名次排序。'],
        'explanation': '销售明细直接排名会把同一商品的不同交易当成多件商品。第一层聚合将粒度变为门店商品，第二层才在各门店独立排名。ROW_NUMBER与product_id决胜条件保证并列时仍最多三行，RANK或DENSE_RANK仅按金额排序可能返回更多商品。退款通过明细视图预聚合处理，避免多次退款放大销售金额。',
        'steps': ['筛选有效线下明细', '按门店商品聚合', '门店内确定性编号', '保留各店前三件商品'],
    },
}

spec = importlib.util.spec_from_file_location('bank_verifier', Q / 'validation/verify_bank.py')
bank = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bank)

def connect(fixture):
    if fixture.get('baseDatabase'):
        db = bank.register(sqlite3.connect(':memory:'))
        source = sqlite3.connect(Q / fixture['baseDatabase'])
        source.backup(db)
        source.close()
    else:
        data = load(Q / fixture['sharedDataPath']) if fixture.get('sharedDataPath') else {}
        db = bank.make_conn({**data, **fixture})
    for statement in fixture.get('patchSql', []):
        db.execute(statement)
    return db

def raw_rows(db, table):
    cursor = db.execute('SELECT * FROM "' + table + '"')
    names = [item[0] for item in cursor.description]
    return [dict(zip(names, row)) for row in cursor]

def raw_sales(db):
    orders = {row['order_id']: row for row in raw_rows(db, 'orders')}
    refunds = defaultdict(int)
    for row in raw_rows(db, 'returns'):
        if row['return_date'] <= '2025-12-31':
            refunds[row['order_item_id']] += row['refund_cents']
    result = []
    for item in raw_rows(db, 'order_items'):
        order = orders[item['order_id']]
        if order['status'] != 'completed':
            continue
        amount = item['quantity'] * item['unit_price_cents'] - item['discount_cents'] - refunds[item['order_item_id']]
        result.append({**order, 'product_id': item['product_id'], 'net_cents': amount})
    return result

def percentage(numerator, denominator):
    if not denominator:
        return None
    return float((Decimal(numerator) * 100 / Decimal(denominator)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def independently_compute(db, qid):
    sales = [row for row in raw_sales(db) if '2025-01-01' <= row['order_date'] <= '2025-12-31']
    if qid == 'q0265':
        customers = {row['customer_id'] for row in raw_rows(db, 'customers')}
        orders = {}
        for row in sales:
            if row['channel'] == 'online' and row['customer_id'] in customers:
                key = (row['customer_id'], row['order_id'])
                orders[key] = orders.get(key, 0) + row['net_cents']
        purchases = defaultdict(int)
        for (customer, _), amount in orders.items():
            if amount > 0:
                purchases[customer] += 1
        buyers = len(purchases)
        repeaters = sum(count >= 2 for count in purchases.values())
        return [[buyers, repeaters, percentage(repeaters, buyers)]]
    totals = defaultdict(int)
    for row in sales:
        if row['channel'] != 'store':
            continue
        key = (row['store_id'], row['product_id']) if qid == 'q0255' else row['order_date'][:7] if qid == 'q0290' else row['store_id']
        totals[key] += row['net_cents']
    if qid == 'q0288':
        stores = [row['store_id'] for row in raw_rows(db, 'stores')]
        overall = sum(totals[store] for store in stores)
        return [[store, totals[store], percentage(totals[store], overall)] for store in sorted(stores, key=lambda store: (-totals[store], store))]
    if qid == 'q0290':
        result = []
        previous = None
        for month in range(1, 13):
            key = f'2025-{month:02d}'
            current = totals[key]
            difference = current - previous if previous is not None else None
            result.append([key, current, previous, difference, percentage(difference, previous) if difference is not None else None])
            previous = current
        return result
    grouped = defaultdict(list)
    for (store, product), amount in totals.items():
        if amount > 0:
            grouped[store].append((product, amount))
    result = []
    for store in sorted(grouped):
        for rank, (product, amount) in enumerate(sorted(grouped[store], key=lambda item: (-item[1], item[0]))[:3], 1):
            result.append([store, product, amount, rank])
    return result


def teaching_fixture(empty=False):
    canonical = sqlite3.connect(Q / 'databases/enterprise/enterprise.sqlite')
    records = {
        'stores': [dict(store_id=n, store_name=f'门店{n}', city='古晋', fulfillment_warehouse_id=1) for n in range(1, 4)],
        'customers': [dict(customer_id=n, customer_name=f'客户{n}', signup_date='2024-01-01', region=None, member_since_date=None) for n in range(1, 5)],
        'calendar_days': [dict(day=f'2025-{n:02d}-01', month_key=f'2025-{n:02d}', day_index=n) for n in range(1, 13)],
        'orders': [], 'order_items': [], 'returns': [],
    }
    # Explicitly auditable boundary data. Scheduled calendar entries are intentionally periodic.
    orders = [
        (1, 1, None, '2025-01-02', 'store', 'completed'),
        (2, 1, None, '2025-03-02', 'store', 'completed'),
        (3, 2, None, '2025-03-03', 'store', 'completed'),
        (4, 1, None, '2024-12-31', 'store', 'completed'),
        (5, None, 1, '2025-01-02', 'online', 'completed'),
        (6, None, 1, '2025-03-02', 'online', 'completed'),
        (7, None, 2, '2025-03-03', 'online', 'completed'),
        (8, None, 2, '2025-04-03', 'online', 'completed'),
        (9, None, 3, '2025-05-03', 'online', 'cancelled'),
        (10, None, 4, '2025-06-03', 'online', 'pending'),
        (11, None, 3, '2026-01-01', 'online', 'completed'),
    ]
    if not empty:
        records['orders'] = [dict(order_id=i,store_id=store,customer_id=customer,session_id=i if channel=='online' else None,order_date=day,channel=channel,status=status,cancellation_reason='客户取消' if status=='cancelled' else None) for i,store,customer,day,channel,status in orders]
        # Four tied products cross the top-three boundary. One order has two lines.
        items = [(1,1,1,2,100),(2,1,2,1,100),(3,1,3,1,100),(4,1,4,1,100),(5,2,5,1,50),(6,3,1,1,80),(7,4,1,1,900),(8,5,1,1,70),(9,5,2,1,30),(10,6,2,1,60),(11,7,1,1,40),(12,8,2,1,20),(13,9,1,1,200),(14,10,1,1,200),(15,11,1,1,200)]
        records['order_items'] = [dict(order_item_id=i,order_id=order,product_id=product,promotion_id=None,quantity=quantity,unit_price_cents=price,discount_cents=0,unit_cost_cents=10) for i,order,product,quantity,price in items]
        records['returns'] = [dict(return_id=1,order_item_id=1,return_date='2025-02-01',quantity=1,refund_cents=100),dict(return_id=2,order_item_id=12,return_date='2025-04-05',quantity=1,refund_cents=20)]
    tables = []
    for name, rows in records.items():
        columns = [{'name': r[1], 'sqliteType': r[2], 'type': r[2]} for r in canonical.execute('PRAGMA table_info("'+name+'")')]
        tables.append({'name': name, 'columns': columns, 'rows': [[row.get(column['name']) for column in columns] for row in rows]})
    setup = ';\n'.join(canonical.execute('SELECT sql FROM sqlite_master WHERE name=?',(name,)).fetchone()[0] for name in ['v_sales_lines','v_order_net'])+';'
    canonical.close()
    return {'kind':'small','tables':tables,'setupSql':setup,'orderPolicy':'ordered','columnPolicy':'exact_names_in_order','numericTolerance':{'absolute':1e-6}}


def main():
    chapters = {path: load(path) for path in sorted((Q / 'questions').glob('ch*.json'))}
    questions = {q['id']: q for ch in chapters.values() for q in ch['questions']}
    report = []
    for qid, definition in DEFINITIONS.items():
        question = questions[qid]
        previous_title = question.setdefault('previousTitle', question['title'])
        sql = definition['sql']
        wrong = sql.replace("o.net_cents>0", "o.net_cents>=0") if qid == 'q0265' else sql.replace("SUM(net_cents) OVER()", "MAX(net_cents) OVER()") if qid == 'q0288' else sql.replace("LAG(net_cents)", "LEAD(net_cents)") if qid == 'q0290' else sql.replace("sales_rank<=3", "sales_rank<=2")
        question.update({
            'title': definition['title'], 'context': definition['context'],
            'requirements': definition['requirements'] + '\n输出字段名称及顺序：' + ', '.join(definition['columns']) + '。',
            'grain': definition['grain'], 'columns': definition['columns'],
            'expectedColumns': definition['columns'], 'sourceTables': definition['sourceTables'],
            'mysqlSql': sql, 'sqliteSql': sql,
            'referenceSolutions': [{'kind': kind, 'mysqlSql': code, 'sqliteSql': code} for kind, code in [('reference', sql), ('equivalent', definition['equivalent'])]],
            'hints': definition['hints'], 'explanation': definition['explanation'],
            'executionSteps': definition['steps'],
            'commonError': {'example': '忽略客户去重、完整月份或汇总粒度会改变业务指标。', 'correction': definition['explanation']},
            'commonErrors': [{'sql': wrong, 'reason': '改变指标条件、总体分母、相邻月份方向或前三名数量。'}],
            'gradingRevision': REVISION, 'contentVersion': VERSION,
            'knowledgePointIds': [definition['kp']], 'primaryKnowledgePointIds': [definition['kp']],
            'prerequisiteKnowledgePointIds': [], 'initialCode': '', 'requiredAstFeatures': [],
            'executionMode': 'query_result', 'runAllowedBeforeSubmit': True,
        })
        if qid == 'q0255':
            question['chapterId'] = 'ch20'
        fixtures = []
        for variant, empty in [('directed-edge', False), ('directed-empty', True)]:
            fid = qid + '-' + variant
            path = 'fixtures/' + qid + '/' + fid + '.json'
            fixture = {**teaching_fixture(empty), 'id':fid,'questionId':qid,'visibility':'hidden','variant':variant,'contentVersion':VERSION}
            write(Q / path, fixture)
            if not any(entry['id']==fid for entry in question['testFixtures']):
                question['testFixtures'].append({'id':fid,'path':path,'visibility':'hidden','variant':variant})
        question['testFixtureIds'] = [entry['id'] for entry in question['testFixtures']]
        for entry in question['testFixtures']:
            fixture_path = Q / entry['path']
            fixture = load(fixture_path)
            db = connect(fixture)
            try:
                result = bank.run(db, sql)
                independent = {'columns': definition['columns'], 'rows': independently_compute(db, qid)}
                assert bank.equal(result, independent, True), (qid, entry['id'], 'independent mismatch')
                assert bank.equal(bank.run(db, definition['equivalent']), independent, True), (qid, entry['id'], 'equivalent mismatch')
                wrong_rejected = not bank.equal(bank.run(db, wrong), independent, True)
            finally:
                db.close()
            fixture['expected'] = independent
            fixture['contentVersion'] = VERSION
            write(fixture_path, fixture)
            entry['sha256'] = digest(fixture_path)
            fixtures.append({'id': entry['id'], 'correct': True, 'equivalent': True, 'independentRawFacts': True, 'wrongRejected': wrong_rejected, 'rows': len(result['rows'])})
            if entry['visibility'] == 'public':
                question['expectedOutput'] = independent
                question['expectedRowCount'] = len(independent['rows'])
        assert any(f['wrongRejected'] for f in fixtures), qid
        question['validation'] = {'kind': REVISION, 'contentVersion': VERSION, 'fixtures': fixtures, 'independentMethod': 'Python逐记录读取orders、order_items、returns、stores与customers，不读取视图或答案结果', 'mysqlNative': '未执行', 'sqlite': True, 'sqliteWasm': False}
        question['validationStatus'] = 'Python SQLite与独立原始事实计算通过；等待WASM复验'
        report.append({'id': qid, 'oldTitle': previous_title, 'newTitle': question['title'], 'fixtures': fixtures})
    for path, chapter in chapters.items():
        chapter['questions'] = [q for q in chapter['questions'] if q['id'] != 'q0255']
        if path.stem == 'ch20':
            chapter['questions'].append(questions['q0255'])
            chapter['questions'].sort(key=lambda q: q['id'])
        write(path, chapter)
    write(Q / 'validation/directed-revision.json', {'contentVersion': VERSION, 'questions': report, 'mysqlNative': '未执行'})
    print('Four requested rewrites executed against public, boundary and independent data, with raw-fact Python cross-checks.')

if __name__ == '__main__':
    main()
