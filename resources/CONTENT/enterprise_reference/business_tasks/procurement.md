# procurement 企业实战

题目资源 4.2.1，数据库 4.2.0。

## BP26 采购价格与合同、历史价格比较

2025年非取消采购行；比较合同单价、成交价及同供应商同商品上一采购行的实际单价；上一行按订单日期、行编号；输出合同差价及较上一单变动率。

输出列为 po_item_id, supplier_id, product_id, unit_price_cents, contract_cents, contract_variance_cents, previous_cents, change_pct。

```sql
WITH a AS (SELECT i.po_item_id,p.supplier_id,i.product_id,p.order_date,i.unit_price_cents,c.unit_price_cents contract_cents,LAG(i.unit_price_cents) OVER(PARTITION BY p.supplier_id,i.product_id ORDER BY p.order_date,i.po_item_id) previous_cents FROM purchase_order_items i JOIN purchase_orders p ON p.po_id=i.po_id JOIN supplier_contracts c ON c.contract_id=i.contract_id WHERE p.status<>'cancelled') SELECT po_item_id,supplier_id,product_id,unit_price_cents,contract_cents,unit_price_cents-contract_cents contract_variance_cents,previous_cents,ROUND(100.0*(unit_price_cents-previous_cents)/NULLIF(previous_cents,0),2) change_pct FROM a WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31' ORDER BY po_item_id;
```

最新公开结果共 3469 行，完整结果见 results/BP26.json。

连接有效合同。计算历史上一行。筛年度并比较。简单比较未经加权的供应商总价可能混入不同商品。

## BP27 供应商准时、完整交付与质量

按2025年承诺到期日且非取消采购行；准时足量=截止承诺日接受数量≥订购量；完整=截至年底接受数量≥订购量；质量合格率=接受件数/实际收货件数；输出供应商及分母。 仅输出至少有一条期间到期采购行的供应商。

输出列为 supplier_id, due_lines, ontime_pct, complete_pct, quality_pct。

```sql
SELECT supplier_id,COUNT(*) due_lines,ROUND(100.0*SUM(CASE WHEN on_time>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) ontime_pct,ROUND(100.0*SUM(CASE WHEN accepted>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) complete_pct,ROUND(100.0*SUM(accepted)/NULLIF(SUM(received),0),2) quality_pct FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY supplier_id ORDER BY supplier_id;
```

最新公开结果共 55 行，完整结果见 results/BP27.json。

按采购行预聚合收货。筛已到期。分别计算两种件数履约和质量指标。有任意一批准时到货并不等于整行准时足量。

## BP28 采购、收货、发票三方核对

2025年非取消采购行（截止年底）；输出订购、合格收货、开票数量，开票金额与合格收货按采购单价的金额差；仅数量不等或金额差不为0；未开票也需要呈现。 本题核对原始开票行，不冲减后续贷项；净应付与贷项的核对见财务题。

输出列为 po_item_id, po_id, supplier_id, product_id, quantity_ordered, accepted, billed, billed_cents, expected_cents, variance_cents。

```sql
WITH billed AS (
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
WHERE quantity_ordered<>accepted OR accepted<>billed OR billed_cents<>expected_cents ORDER BY po_item_id;
```

最新公开结果共 928 行，完整结果见 results/BP28.json。

独立按发票日期汇总截止日开票行。连接已预聚合的采购和合格收货。比较订购收货开票数量与金额。v_po_lines的开票汇总不含发票日期过滤；截至年底核对需重新汇总日期合格的发票行。

## BP29 同商品跨供应商采购价差

2025年非取消采购行，同商品同供应商采购金额/订购量为加权单价；只比较有至少两家供应商商品；输出供应商加权价、最低价及相对最低价的溢价率。 派生加权均价允许末位1分的跨引擎浮点舍入差异；原始整数金额、件数及标识仍须精确。 仅weighted_price_cents和low_price_cents允许0.0100001分绝对误差，premium_pct绝对误差上限为0.000001个百分点；商品和供应商编号精确比较。

输出列为 product_id, supplier_id, weighted_price_cents, low_price_cents, premium_pct。

```sql
WITH a AS (SELECT product_id,supplier_id,SUM(ordered_cents)*1.0/SUM(quantity_ordered) avg_price FROM v_po_lines WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY product_id,supplier_id), b AS (SELECT *,MIN(avg_price) OVER(PARTITION BY product_id) low,COUNT(*) OVER(PARTITION BY product_id) n FROM a) SELECT product_id,supplier_id,ROUND(avg_price*100,0)/100.0 weighted_price_cents,ROUND(low*100,0)/100.0 low_price_cents,ROUND(100.0*(avg_price-low)/NULLIF(low,0),2) premium_pct FROM b WHERE n>=2 ORDER BY product_id,premium_pct,supplier_id;
```

最新公开结果共 548 行，完整结果见 results/BP29.json。

按每商品供应商求加权价。窗口求最低与样本数。比较价差。对单位价格直接AVG没有反映采购数量权重。

## BP30 供应商多指标综合评价

2025年到期采购行；至少10行；准时足量率40%、完整率25%、质量合格率20%、合同价格达标率15%（实际采购价≤合同价行数/到期行数）；质量分母为0时评分NULL；输出各指标和总分，按总分降序。

输出列为 supplier_id, due_lines, ontime_pct, complete_pct, quality_pct, contract_pct, score。

```sql
WITH a AS (SELECT v.supplier_id,COUNT(*) n,100.0*SUM(CASE WHEN v.on_time>=v.quantity_ordered THEN 1 ELSE 0 END)/COUNT(*) ot,100.0*SUM(CASE WHEN v.accepted>=v.quantity_ordered THEN 1 ELSE 0 END)/COUNT(*) fill,100.0*SUM(accepted)/NULLIF(SUM(received),0) quality,100.0*SUM(CASE WHEN v.unit_price_cents<=c.unit_price_cents THEN 1 ELSE 0 END)/COUNT(*) price_ok FROM v_po_lines v JOIN purchase_order_items i ON i.po_item_id=v.po_item_id JOIN supplier_contracts c ON c.contract_id=i.contract_id WHERE v.promised_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY v.supplier_id) SELECT supplier_id,n due_lines,ROUND(ot,2) ontime_pct,ROUND(fill,2) complete_pct,ROUND(quality,2) quality_pct,ROUND(price_ok,2) contract_pct,ROUND(.4*ot+.25*fill+.2*quality+.15*price_ok,2) score FROM a WHERE n>=10 ORDER BY score DESC,supplier_id;
```

最新公开结果共 37 行，完整结果见 results/BP30.json。

计算四项百分比。保留充足样本。加权评分。排序。不说明权重、样本门槛和缺失指标处理会使评分不可解释。
