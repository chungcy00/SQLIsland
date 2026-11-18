-- 高价值流失风险客户
-- 题目资源4.2.1，原生MySQL8.4尚未验证

WITH a AS (SELECT customer_id,COUNT(*) freq,MAX(order_date) last_day,SUM(net_cents) net,SUM(net_cents-cost_cents) gross FROM v_order_net WHERE channel='online' GROUP BY customer_id), b AS (SELECT *,NTILE(5) OVER(ORDER BY net DESC,customer_id) bucket FROM a) SELECT b.customer_id,freq,net net_cents,gross gross_cents,1095-d.day_index recency_days FROM b JOIN calendar_days d ON d.day=b.last_day WHERE bucket=1 AND freq>=3 AND 1095-d.day_index>=90 ORDER BY gross DESC,b.customer_id;

WITH a AS (SELECT customer_id,COUNT(*) freq,MAX(order_date) last_day,SUM(net_cents) net,SUM(net_cents-cost_cents) gross FROM v_order_net WHERE channel='online' GROUP BY customer_id), b AS (SELECT *,NTILE(5) OVER(ORDER BY net DESC,customer_id) bucket FROM a) SELECT b.customer_id,freq,net net_cents,gross gross_cents,1095-d.day_index recency_days FROM b JOIN calendar_days d ON d.day=b.last_day WHERE bucket=1 AND freq>2 AND 1095-d.day_index>=90 ORDER BY gross DESC,b.customer_id;
