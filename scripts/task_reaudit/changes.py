"""Business corrections established against the frozen 2026-11-18 resource snapshot."""

CHANGES = {
    5: {
        "category": "E",
        "issue": "12家门店旧异常数全部为1，90%达成率阈值全部触发，固定毛利和退款阈值全部不触发，无法排序经营风险。",
        "requirements": "2025年第四季度线下门店，保留全部门店。输出净销售、毛利率、目标达成率、退款率及净销售RANK排名。以所有门店汇总后的加权指标为比较基准，不能平均各店比率。三项复核标记分别为毛利率低于整体毛利率1个百分点、达成率低于整体达成率的80%、退款率高于整体退款率的125%。整体达成率仅纳入目标金额为正的门店，分子也使用这些门店的净销售。退款率=退款额/退款前折后销售额。基准或门店比率分母为0时为NULL，该项不计标记。标记使用未舍入值，输出比率保留2位小数。按标记数降序、门店编号升序，排名并列保留空位。该表是相对经营复核名单，不代表公司已达到年度预算。",
        "steps": [
            "分别汇总门店销售与季度目标",
            "计算全体加权基准",
            "比较未舍入比率并累计标记",
            "对所有门店进行销售排名",
        ],
        "error": "旧阈值使所有门店同分；简单平均门店比率或在筛风险后才排名均会改变比较总体。",
        "sql": """WITH a AS (
  SELECT store_id, SUM(net_cents) net, SUM(cost_cents) cost, SUM(refund_cents) refund
  FROM v_sales_lines
  WHERE channel='store' AND order_date BETWEEN '2025-10-01' AND '2025-12-31'
  GROUP BY store_id
), b AS (
  SELECT store_id, SUM(target_cents) target FROM sales_targets
  WHERE month_key BETWEEN '2025-10' AND '2025-12' GROUP BY store_id
), p AS (
  SELECT s.store_id, COALESCE(a.net,0) net, COALESCE(a.cost,0) cost,
    COALESCE(a.refund,0) refund, b.target,
    100.0*(a.net-a.cost)/NULLIF(a.net,0) margin,
    100.0*COALESCE(a.net,0)/NULLIF(b.target,0) attainment,
    100.0*a.refund/NULLIF(a.net+a.refund,0) refund_rate
  FROM stores s LEFT JOIN a ON a.store_id=s.store_id LEFT JOIN b ON b.store_id=s.store_id
), benchmark AS (
  SELECT 100.0*SUM(net-cost)/NULLIF(SUM(net),0) margin,
    100.0*SUM(CASE WHEN target>0 THEN net ELSE 0 END)/NULLIF(SUM(CASE WHEN target>0 THEN target ELSE 0 END),0) attainment,
    100.0*SUM(refund)/NULLIF(SUM(net+refund),0) refund_rate FROM p
), z AS (
  SELECT p.*,
    CASE WHEN p.margin<benchmark.margin-1 THEN 1 ELSE 0 END
    +CASE WHEN p.attainment<benchmark.attainment*.8 THEN 1 ELSE 0 END
    +CASE WHEN p.refund_rate>benchmark.refund_rate*1.25 THEN 1 ELSE 0 END flags,
    RANK() OVER(ORDER BY net DESC) sales_rank FROM p CROSS JOIN benchmark
)
SELECT store_id, net net_cents, ROUND(margin,2) margin_pct,
  ROUND(attainment,2) achievement_pct, ROUND(refund_rate,2) refund_pct, flags, sales_rank
FROM z ORDER BY flags DESC,store_id""",
    },
    10: {
        "category": "C",
        "issue": "标题写供应商风险，实际输出为仓库商品在多个供应商上的合并履约率，且采购行等权口径未明确。",
        "title": "补货优先级与商品历史履约风险",
        "append": "履约率按同一仓库、同一商品的全部历史到期非取消采购行等权计算，可能包含多个供应商；该指标用于商品供给风险复核，不代表某一家供应商评分。",
    },
    14: {
        "category": "D",
        "issue": "转化分母按访问日期、分子按订单日期，跨年会话可能使分子分母不属于同一观察总体；无会话渠道返回NULL数量。",
        "requirements": "以2025-01-01至2025-12-31发生的访问会话为观察总体，按会话渠道归因。转化会话是这些会话中截至2025-12-31关联至少一张有效线上订单的不同会话，转化率=转化会话数/观察会话数。新客仅计历史首次有效线上订单在该观察会话内发生且订单日期在2025年的客户，首次按订单日期、订单编号决胜。净收入广告回报的收入同样只取观察会话内2025年有效线上订单的净额。广告支出按渠道2025年月份汇总，获客成本=广告支出/新客数。保留全部渠道，无会话和无转化计0，缺少广告预算记录的支出及相关比率为NULL，零分母为NULL。获客成本保留2位、回报倍数4位、百分比2位小数。",
        "steps": [
            "确定期间访问会话总体",
            "在完整历史上识别首购",
            "在同一会话总体内统计转化和净收入",
            "独立汇总广告支出并保留无访问渠道",
        ],
        "error": "跨年会话不能只凭订单日期进入当年转化分子；不同订单共享会话时会话只计一次。",
    },
    19: {
        "category": "D",
        "issue": "真实银行流水存在正向冲回，原题“支出绝对值”与代码净支出不同；NULL参考号合成键可能与真实参考号碰撞。",
        "requirements": "2025年费用凭证按真实reference_no汇总费用净额；银行按真实reference_no汇总净支出，净支出=-SUM(amount_cents)，正向冲回或收入作为负支出，不能逐行取ABS。采用两端全量键集合，每条NULL银行参考号单独对账，并用reference_kind区分reference与unreferenced_bank，防止合成显示名BANK-编号与真实参考号碰撞。返回有缺失或金额差异的记录，差额=银行净支出-账簿费用；缺失端输出NULL。显示ref为真实参考号或BANK-银行编号。按ref升序、reference_kind升序。",
        "steps": [
            "按真实参考号分别汇总有符号金额",
            "给无参考号流水独立类型及编号键",
            "合并两端完整键集合",
            "筛选缺失与金额差异",
        ],
        "error": "逐行ABS会掩盖银行冲回；只用BANK-编号作为键可能与真实参考号合并。",
        "sql": """WITH a AS (
  SELECT 0 unreferenced, reference_no ref, SUM(expense_cents) ledger
  FROM v_expenses WHERE entry_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY reference_no
), b AS (
  SELECT CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END unreferenced,
    COALESCE(reference_no,CAST(bank_id AS CHAR)) ref, SUM(-amount_cents) bank
  FROM bank_transactions WHERE transaction_date BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END,COALESCE(reference_no,CAST(bank_id AS CHAR))
), k AS (
  SELECT unreferenced,ref FROM a UNION SELECT unreferenced,ref FROM b
)
SELECT CASE WHEN k.unreferenced=1 THEN CONCAT('BANK-',k.ref) ELSE k.ref END ref,
  a.ledger ledger_cents,b.bank bank_cents,COALESCE(b.bank,0)-COALESCE(a.ledger,0) difference_cents,
  CASE WHEN a.ref IS NULL THEN 'bank_only' WHEN b.ref IS NULL THEN 'ledger_only' ELSE 'difference' END issue,
  CASE WHEN k.unreferenced=1 THEN 'unreferenced_bank' ELSE 'reference' END reference_kind
FROM k LEFT JOIN a ON a.ref=k.ref AND a.unreferenced=k.unreferenced
LEFT JOIN b ON b.ref=k.ref AND b.unreferenced=k.unreferenced
WHERE a.ref IS NULL OR b.ref IS NULL OR a.ledger<>b.bank ORDER BY ref,reference_kind""",
    },
    20: {
        "category": "D",
        "issue": "按整张采购单合格收货金额比较每张发票，会将分批开票和贷项调整当价格异常；大额基准混入贷项后的净应付。",
        "requirements": "截至2025-12-31的每张发票计算四个复核标记：同供应商同invoice_no存在多张发票；原始发票面额超过该供应商全部期间内发票面额均值的2倍；净应付减实付余额为负；原始发票面额与本张发票已开票数量按对应采购行单价重算金额相差超过100分。面额及采购重算金额均在本张发票行内汇总，不能使用整张采购单总收货金额，不冲减贷项；超额付款标记使用截止日已批准贷项后的净应付。数量是否超收或超开票由三方核对题检查，本题第四项专门识别开票价格差异。输出净应付billed_cents和四个标记，至少一个标记才返回，按标记数降序、发票编号升序。大额及价格标记使用未舍入值，标记只代表复核候选。",
        "steps": [
            "按发票汇总原始面额和采购价重算金额",
            "在供应商内计算面额基准与重复号码",
            "独立取截止日贷项和付款余额",
            "累计四项标记",
        ],
        "error": "分批发票不能与整单收货金额比较；已批准贷项不应自动变成发票单价错误。",
        "sql": """WITH f AS (
  SELECT x.supplier_invoice_id,SUM(x.quantity_billed*x.unit_price_cents) face,
    SUM(x.quantity_billed*p.unit_price_cents) expected
  FROM supplier_invoice_items x JOIN purchase_order_items p ON p.po_item_id=x.po_item_id
  GROUP BY x.supplier_invoice_id
), a AS (
  SELECT v.*,f.face,f.expected,COUNT(*) OVER(PARTITION BY supplier_id,invoice_no) copies,
    AVG(f.face) OVER(PARTITION BY supplier_id) avg_bill
  FROM v_invoice_balance v JOIN f ON f.supplier_invoice_id=v.supplier_invoice_id
), z AS (
  SELECT a.*,CASE WHEN copies>1 THEN 1 ELSE 0 END duplicate_flag,
    CASE WHEN face>2*avg_bill THEN 1 ELSE 0 END large_flag,
    CASE WHEN balance_cents<0 THEN 1 ELSE 0 END overpay_flag,
    CASE WHEN ABS(face-expected)>100 THEN 1 ELSE 0 END mismatch_flag FROM a
)
SELECT supplier_invoice_id,supplier_id,billed_cents,duplicate_flag,large_flag,overpay_flag,mismatch_flag,
  duplicate_flag+large_flag+overpay_flag+mismatch_flag flags FROM z
WHERE duplicate_flag+large_flag+overpay_flag+mismatch_flag>0 ORDER BY flags DESC,supplier_invoice_id""",
    },
    28: {
        "category": "B",
        "issue": "所用v_po_lines的billed未按发票日期截止，未来开票可污染截止日三方核对。",
        "steps": [
            "独立按发票日期汇总截止日开票行",
            "连接已预聚合的采购和合格收货",
            "比较订购收货开票数量与金额",
        ],
        "error": "v_po_lines的开票汇总不含发票日期过滤；截至年底核对需重新汇总日期合格的发票行。",
        "sql": """WITH billed AS (
  SELECT x.po_item_id,SUM(x.quantity_billed) billed,SUM(x.quantity_billed*x.unit_price_cents) billed_cents
  FROM supplier_invoice_items x JOIN supplier_invoices f ON f.supplier_invoice_id=x.supplier_invoice_id
  WHERE f.invoice_date<='2025-12-31' GROUP BY x.po_item_id
), checked AS (
  SELECT v.po_item_id,v.po_id,v.supplier_id,v.product_id,v.quantity_ordered,v.accepted,
    COALESCE(b.billed,0) billed,COALESCE(b.billed_cents,0) billed_cents,v.accepted*v.unit_price_cents expected_cents
  FROM v_po_lines v LEFT JOIN billed b ON b.po_item_id=v.po_item_id
  WHERE v.order_date BETWEEN '2025-01-01' AND '2025-12-31'
)
SELECT po_item_id,po_id,supplier_id,product_id,quantity_ordered,accepted,billed,billed_cents,expected_cents,
  billed_cents-expected_cents variance_cents FROM checked
WHERE quantity_ordered<>accepted OR accepted<>billed OR billed_cents<>expected_cents ORDER BY po_item_id""",
    },
    37: {
        "category": "B",
        "issue": "库存快照内连接会丢弃有逾期采购但缺快照的商品仓库，从而漏计供应商逾期金额。",
        "steps": [
            "汇总供应商商品仓的逾期金额",
            "左连接期末快照保留全部采购风险",
            "仅在快照完整时汇总库存暴露价值",
        ],
        "error": "缺失快照不能删除逾期采购；任一关联商品仓缺快照时整体库存暴露值返回NULL。",
        "sql": """WITH a AS (
  SELECT supplier_id,warehouse_id,product_id,SUM((quantity_ordered-accepted)*unit_price_cents) overdue_value
  FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31' AND quantity_ordered>accepted
  GROUP BY supplier_id,warehouse_id,product_id
)
SELECT a.supplier_id,COUNT(*) affected_pairs,SUM(a.overdue_value) overdue_cents,
  CASE WHEN COUNT(i.snapshot_id)=COUNT(*) THEN SUM(i.quantity*i.unit_cost_cents) ELSE NULL END exposed_stock_cents
FROM a LEFT JOIN inventory_snapshots i ON i.warehouse_id=a.warehouse_id AND i.product_id=a.product_id
  AND i.snapshot_date='2025-12-31'
GROUP BY a.supplier_id ORDER BY overdue_cents DESC,a.supplier_id""",
    },
    42: {
        "category": "D",
        "issue": "旧答案将每张发票重复使用整张采购单合格收货价值，无法支持部分开票、多个发票及重复发票。",
        "requirements": "截至2025-12-31，筛选已发生付款且净应付与可分配合格收货计价金额差的绝对值超过100分的发票。先按采购行汇总截止日合格收货量，再按发票日期、发票编号、发票行编号依次将该采购行收货量分配给已开票数量，每行分配量=min(本行开票量,max(合格收货总量-更早发票行累计开票量,0))，同一收货量只能分配一次。每张发票received_cents为分配量乘原采购行单价之和。净应付billed_cents扣截至截止日批准贷项，paid_cents仅计截止日前实付。返回净应付减可分配金额以及实付减可分配金额，差额可为正或负；不能把所有差额都称为超付。按账单差额绝对值降序、发票编号升序。分配是期末复核口径，包含截至年底的后续收货，不代表付款日当时已收货，也不自动判定欺诈。",
        "steps": [
            "按采购行汇总合格收货",
            "按发票行时间顺序计算累计开票量",
            "分配不会重复使用的合格收货价值",
            "关联净应付与实付并筛选差额",
        ],
        "error": "一张采购单可有多张部分或重复发票，不能为每张发票重复分配整单收货。",
        "sql": """WITH receipts AS (
  SELECT po_item_id,SUM(quantity_received-quantity_rejected) accepted
  FROM goods_receipts WHERE receipt_date<='2025-12-31' GROUP BY po_item_id
), lines AS (
  SELECT x.*,p.unit_price_cents po_price,COALESCE(r.accepted,0) accepted,
    COALESCE(SUM(x.quantity_billed) OVER(PARTITION BY x.po_item_id
      ORDER BY f.invoice_date,f.supplier_invoice_id,x.supplier_invoice_item_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_billed
  FROM supplier_invoice_items x JOIN supplier_invoices f ON f.supplier_invoice_id=x.supplier_invoice_id
  JOIN purchase_order_items p ON p.po_item_id=x.po_item_id LEFT JOIN receipts r ON r.po_item_id=x.po_item_id
  WHERE f.invoice_date<='2025-12-31'
), allocated AS (
  SELECT supplier_invoice_id,SUM(CASE WHEN accepted<=prior_billed THEN 0
    WHEN accepted-prior_billed>=quantity_billed THEN quantity_billed
    ELSE accepted-prior_billed END*po_price) received FROM lines GROUP BY supplier_invoice_id
)
SELECT b.supplier_invoice_id,b.po_id,b.billed_cents,b.paid_cents,a.received received_cents,
  b.billed_cents-a.received bill_difference_cents,b.paid_cents-a.received paid_difference_cents
FROM v_invoice_balance b JOIN allocated a ON a.supplier_invoice_id=b.supplier_invoice_id
WHERE b.paid_cents>0 AND ABS(b.billed_cents-a.received)>100
ORDER BY ABS(b.billed_cents-a.received) DESC,b.supplier_invoice_id""",
    },
    45: {
        "category": "B",
        "issue": "内连接广告预算表会删除有成熟新客但没有广告预算行的渠道月份，缺失与0支出未区分。",
        "steps": [
            "在完整历史中确定首购及渠道",
            "按0至89日计算成熟客户毛利",
            "保留有成熟客户的全部渠道月份",
            "以全部新客分摊预算，缺失预算保留NULL",
        ],
        "error": "没有预算行不是0成本，不能删除同期群，也不能把成熟客户数量当获客成本分母。",
    },
    50: {
        "category": "E",
        "issue": "四个季度旧风险数全部为3，费用率和人工率固定阈值全部触发；期末库存按整月求和会误纳入月内其他快照，缺失统计范围不明确。",
        "requirements": "2025年每季度跨域报告，与2024年同季度比较。输出本期净销售、毛利率、费用率、人工率、2025年到期采购行准时足量率和准确季度末库存标准价值。三项同比变化按本期比率减2024年同期比率，单位为百分点。风险项为毛利率同比下降超过3个百分点、费用率同比上升超过10个百分点、人工率同比上升超过10个百分点、当期准时足量率低于60%。以未舍入比率判定，指标显示2位小数，保留四个季度。零分母或缺失同比基准返回NULL，该项不计风险。missing_count统计三项同比变化、当期履约率及季度末库存价值这五项的NULL数。期末库存仅取季度最后一个自然日，任何仓库商品组合缺少该日快照时总库存价值为NULL，不能把缺失当0或累计整个月快照。费用、人工、销售和采购各自汇总后再连接；采购承诺不计费用。风险阈值用于教学复核，不是审计结论。",
        "steps": [
            "分别汇总2024及2025各季度原始指标",
            "按准确季度末日期校验完整库存",
            "连接上年同季度并计算百分点变化",
            "按未舍入指标判风险及缺失数",
        ],
        "error": "旧固定阈值无法区分四季；同比是同季比率之差，月内多次快照不能相加成期末库存。",
    },
}

CHANGES[50][
    "sql"
] = """WITH qm AS (
  SELECT month_key,CONCAT(SUBSTR(month_key,1,4),'-Q',
    CASE WHEN SUBSTR(month_key,6,2)<='03' THEN '1' WHEN SUBSTR(month_key,6,2)<='06' THEN '2'
      WHEN SUBSTR(month_key,6,2)<='09' THEN '3' ELSE '4' END) q,MAX(day) month_end
  FROM calendar_days WHERE month_key BETWEEN '2024-01' AND '2025-12' GROUP BY month_key
), qs AS (
  SELECT q,MAX(month_end) end_day FROM qm GROUP BY q
), s AS (
  SELECT qm.q,SUM(v.net_cents) net,SUM(v.net_cents-v.cost_cents) gross
  FROM v_sales_lines v JOIN qm ON qm.month_key=SUBSTR(v.order_date,1,7) GROUP BY qm.q
), f AS (
  SELECT qm.q,SUM(v.expense_cents) expense FROM v_expenses v
  JOIN qm ON qm.month_key=SUBSTR(v.entry_date,1,7) GROUP BY qm.q
), h AS (
  SELECT qm.q,SUM(v.labor_cents) labor FROM v_staff_month v
  JOIN qm ON qm.month_key=v.month_key GROUP BY qm.q
), p AS (
  SELECT qm.q,COUNT(*) n,SUM(CASE WHEN v.on_time>=v.quantity_ordered THEN 1 ELSE 0 END) good
  FROM v_po_lines v JOIN qm ON qm.month_key=SUBSTR(v.promised_date,1,7) GROUP BY qm.q
), i AS (
  SELECT qs.q,CASE WHEN COUNT(x.snapshot_id)=(SELECT COUNT(*) FROM products)*(SELECT COUNT(*) FROM warehouses)
    THEN SUM(x.quantity*x.unit_cost_cents) ELSE NULL END stock
  FROM qs LEFT JOIN inventory_snapshots x ON x.snapshot_date=qs.end_day GROUP BY qs.q
), metrics AS (
  SELECT qs.q,s.net,100.0*s.gross/NULLIF(s.net,0) margin,
    100.0*COALESCE(f.expense,0)/NULLIF(s.net,0) expense_pct,
    100.0*COALESCE(h.labor,0)/NULLIF(s.net,0) labor_pct,
    100.0*p.good/NULLIF(p.n,0) delivery,i.stock FROM qs
  LEFT JOIN s ON s.q=qs.q LEFT JOIN f ON f.q=qs.q LEFT JOIN h ON h.q=qs.q
  LEFT JOIN p ON p.q=qs.q LEFT JOIN i ON i.q=qs.q
), compared AS (
  SELECT a.*,a.margin-b.margin margin_change,a.expense_pct-b.expense_pct expense_change,
    a.labor_pct-b.labor_pct labor_change FROM metrics a
  LEFT JOIN metrics b ON b.q=CONCAT('2024',SUBSTR(a.q,5)) WHERE a.q BETWEEN '2025-Q1' AND '2025-Q4'
)
SELECT q,net net_cents,ROUND(margin,2) margin_pct,ROUND(expense_pct,2) expense_pct,
  ROUND(labor_pct,2) labor_pct,ROUND(delivery,2) delivery_pct,stock stock_cents,
  ROUND(margin_change,2) margin_change_points,ROUND(expense_change,2) expense_change_points,
  ROUND(labor_change,2) labor_change_points,
  CASE WHEN margin_change < -3 THEN 1 ELSE 0 END+CASE WHEN expense_change>10 THEN 1 ELSE 0 END
    +CASE WHEN labor_change>10 THEN 1 ELSE 0 END+CASE WHEN delivery<60 THEN 1 ELSE 0 END risk_count,
  CASE WHEN margin_change IS NULL THEN 1 ELSE 0 END+CASE WHEN expense_change IS NULL THEN 1 ELSE 0 END
    +CASE WHEN labor_change IS NULL THEN 1 ELSE 0 END+CASE WHEN delivery IS NULL THEN 1 ELSE 0 END
    +CASE WHEN stock IS NULL THEN 1 ELSE 0 END missing_count
FROM compared ORDER BY q"""

CHANGES[29] = {
    "category": "C",
    "issue": "原容差对全部小数列生效，价格允许1分差异的规则也放宽了溢价百分比判题。",
    "append": "仅weighted_price_cents和low_price_cents允许0.0100001分绝对误差，premium_pct绝对误差上限为0.000001个百分点；商品和供应商编号精确比较。",
}
