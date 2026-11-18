# retail 企业实战

题目资源 4.2.1，数据库 4.2.0。

## BP01 门店净销售、利润与目标达成

每门店一行；有效线下订单，按原订单日期归属截至年底退货；毛利=净销售-退货冲减后成本；毛利率和目标达成率使用百分比，分母为0返回NULL；金额单位分。保留无销售门店。

输出列为 store_id, net_cents, gross_cents, margin_pct, target_cents, achievement_pct。

```sql
WITH a AS (SELECT store_id,SUM(net_cents) net,SUM(cost_cents) cost FROM v_sales_lines WHERE channel='store' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY store_id), b AS (SELECT store_id,SUM(target_cents) target FROM sales_targets WHERE month_key BETWEEN '2025-01' AND '2025-12' GROUP BY store_id) SELECT s.store_id,COALESCE(a.net,0) net_cents,COALESCE(a.net-a.cost,0) gross_cents,ROUND(100.0*(a.net-a.cost)/NULLIF(a.net,0),2) margin_pct,b.target target_cents,ROUND(100.0*COALESCE(a.net,0)/NULLIF(b.target,0),2) achievement_pct FROM stores s LEFT JOIN a ON a.store_id=s.store_id LEFT JOIN b ON b.store_id=s.store_id ORDER BY s.store_id;
```

最新公开结果共 12 行，完整结果见 results/BP01.json。

先按门店聚合销售与成本。独立累计目标。左连接门店。计算比率。直接连接月目标与订单明细会重复累计目标。

## BP02 门店月度环比同比与持续下滑

构造2023—2025完整门店月份轴；2025年逐月返回净销售、环比、同比及连续三月负增长标志；上期零或缺失时比率NULL。

输出列为 store_id, month_key, net_cents, mom_pct, yoy_pct, three_declines。

```sql
WITH m AS (SELECT DISTINCT month_key FROM calendar_days WHERE day<='2025-12-31'), a AS (SELECT store_id,SUBSTR(order_date,1,7) m,SUM(net_cents) net FROM v_sales_lines WHERE channel='store' GROUP BY store_id,SUBSTR(order_date,1,7)), b AS (SELECT s.store_id,m.month_key,COALESCE(a.net,0) net FROM stores s CROSS JOIN m LEFT JOIN a ON a.store_id=s.store_id AND a.m=m.month_key), p AS (SELECT *,LAG(net) OVER(PARTITION BY store_id ORDER BY month_key) prev,LAG(net,12) OVER(PARTITION BY store_id ORDER BY month_key) prior_year FROM b), q AS (SELECT *,CASE WHEN prev>0 AND net<prev THEN 1 ELSE 0 END falling FROM p), z AS (SELECT *,SUM(falling) OVER(PARTITION BY store_id ORDER BY month_key ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) fall3 FROM q) SELECT store_id,month_key,net net_cents,ROUND(100.0*(net-prev)/NULLIF(prev,0),2) mom_pct,ROUND(100.0*(net-prior_year)/NULLIF(prior_year,0),2) yoy_pct,CASE WHEN fall3=3 THEN 1 ELSE 0 END three_declines FROM z WHERE month_key BETWEEN '2025-01' AND '2025-12' ORDER BY store_id,month_key;
```

最新公开结果共 144 行，完整结果见 results/BP02.json。

构造月份轴。汇总销售并补零。计算两个历史窗口。滚动检查连续下滑。最后筛2025。先筛2025再计算窗口会丢失去年和上月。

## BP03 高销售低毛利商品诊断

2025年线下商品净销售额位于前四分之一且毛利率低于30%；返回销售、毛利率、折扣额、退款额；按净销售降序、商品编号升序。四分位使用NTILE(4)，并列按编号。

输出列为 product_id, net_cents, margin_pct, discount_cents, refund_cents。

```sql
WITH a AS (SELECT product_id,SUM(net_cents) net,SUM(cost_cents) cost,SUM(discount_cents) discount,SUM(refund_cents) refund FROM v_sales_lines WHERE channel='store' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY product_id), b AS (SELECT *,NTILE(4) OVER(ORDER BY net DESC,product_id) bucket FROM a) SELECT product_id,net net_cents,ROUND(100.0*(net-cost)/NULLIF(net,0),2) margin_pct,discount discount_cents,refund refund_cents FROM b WHERE bucket=1 AND 100.0*(net-cost)/NULLIF(net,0)<30 ORDER BY net DESC,product_id;
```

最新公开结果共 23 行，完整结果见 results/BP03.json。

按商品独立汇总。按全体净额分箱。应用毛利阈值。输出折扣退款。先按毛利筛选再计算销售四分位改变总体。

## BP04 促销与非促销的日均表现

2025年线下订单，按日期是否落在任一促销区间分组；计算日均净销售、日均净件数、毛利率；日数来自完整日历，包含零销售日；不将相关性解释为因果。 促销日指存在至少一个可用于线下门店的活动的自然日，不要求每笔交易实际使用优惠；区域或品类活动也计入该日。线上专属活动不标记线下促销日。重叠活动只计一个自然日，销售先按日汇总，不直接按活动区间展开明细。

输出列为 promo, days, daily_net_cents, daily_units, margin_pct。

```sql
WITH d AS (SELECT day,CASE WHEN EXISTS(SELECT 1 FROM promotions p WHERE day BETWEEN p.start_date AND p.end_date AND p.channel_scope IN ('all','store')) THEN 1 ELSE 0 END promo FROM calendar_days WHERE day BETWEEN '2025-01-01' AND '2025-12-31'), a AS (SELECT order_date,SUM(net_cents) net,SUM(net_qty) qty,SUM(cost_cents) cost FROM v_sales_lines WHERE channel='store' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY order_date) SELECT d.promo,COUNT(*) days,ROUND(1.0*SUM(COALESCE(a.net,0))/COUNT(*),2) daily_net_cents,ROUND(1.0*SUM(COALESCE(a.qty,0))/COUNT(*),2) daily_units,ROUND(100.0*SUM(a.net-a.cost)/NULLIF(SUM(a.net),0),2) margin_pct FROM d LEFT JOIN a ON a.order_date=d.day GROUP BY d.promo ORDER BY d.promo;
```

最新公开结果共 2 行，完整结果见 results/BP04.json。

日历标记促销日。独立日级汇总。补全日历。计算日均及加权毛利率。按活动日期直接连接销售，重叠活动使同一明细被重复累加；把存在活动误当成每笔交易均适用。

## BP05 门店综合经营异常看板

2025年第四季度线下门店，保留全部门店。输出净销售、毛利率、目标达成率、退款率及净销售RANK排名。以所有门店汇总后的加权指标为比较基准，不能平均各店比率。三项复核标记分别为毛利率低于整体毛利率1个百分点、达成率低于整体达成率的80%、退款率高于整体退款率的125%。整体达成率仅纳入目标金额为正的门店，分子也使用这些门店的净销售。退款率=退款额/退款前折后销售额。基准或门店比率分母为0时为NULL，该项不计标记。标记使用未舍入值，输出比率保留2位小数。按标记数降序、门店编号升序，排名并列保留空位。该表是相对经营复核名单，不代表公司已达到年度预算。

输出列为 store_id, net_cents, margin_pct, achievement_pct, refund_pct, flags, sales_rank。

```sql
WITH a AS (
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
FROM z ORDER BY flags DESC,store_id;
```

最新公开结果共 12 行，完整结果见 results/BP05.json。

分别汇总门店销售与季度目标。计算全体加权基准。比较未舍入比率并累计标记。对所有门店进行销售排名。旧阈值使所有门店同分；简单平均门店比率或在筛风险后才排名均会改变比较总体。
