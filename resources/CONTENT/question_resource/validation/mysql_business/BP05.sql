-- 门店综合经营异常看板
-- 题目资源4.2.1，原生MySQL8.4尚未验证

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

WITH a AS (
  SELECT store_id, SUM(net_cents) net, SUM(cost_cents) cost, SUM(refund_cents) refund
  FROM v_sales_lines
  WHERE channel='store' AND (order_date>='2025-10-01' AND order_date<='2025-12-31')
  GROUP BY store_id
), b AS (
  SELECT store_id, SUM(target_cents) target FROM sales_targets
  WHERE (month_key>='2025-10' AND month_key<='2025-12') GROUP BY store_id
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
