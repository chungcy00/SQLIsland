# ecommerce 企业实战

题目资源 4.2.1，数据库 4.2.0。

## BP11 新老客户净收入及客单价

仅线上有效订单。客户首次有效订单以日期、订单编号决胜；2025年按订单是否首购分组，输出客户数、订单数、净收入和平均订单净额（分）。

输出列为 segment, customers, orders, net_cents, avg_order_cents。

```sql
WITH a AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY customer_id ORDER BY order_date,order_id) rn FROM v_order_net WHERE channel='online') SELECT CASE WHEN rn=1 THEN 'new' ELSE 'returning' END segment,COUNT(DISTINCT customer_id) customers,COUNT(*) orders,SUM(net_cents) net_cents,ROUND(1.0*SUM(net_cents)/COUNT(*),2) avg_order_cents FROM a WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY CASE WHEN rn=1 THEN 'new' ELSE 'returning' END ORDER BY segment;
```

最新公开结果共 2 行，完整结果见 results/BP11.json。

计算完整历史订单序号。筛选目标年。按首购标记汇总。先筛2025会把已有购买客户误标为新客；客户可在两个组出现。

## BP12 最近消费、频率、金额客户分层

2025年有线上有效购买的客户；截止12-31距最近购买天数；年度订单数和净消费金额；分别按最近日期近到远、频率高到低、金额高到低分五组（并列客户编号）；三个分数5为最好；总分≥13为高价值、≤6为低活跃。

输出列为 customer_id, recency_days, freq, net_cents, r_score, f_score, m_score, segment。

```sql
WITH a AS (SELECT customer_id,MAX(order_date) last_day,COUNT(*) freq,SUM(net_cents) money FROM v_order_net WHERE channel='online' AND order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY customer_id), b AS (SELECT *,6-NTILE(5) OVER(ORDER BY last_day DESC,customer_id) r_score,6-NTILE(5) OVER(ORDER BY freq DESC,customer_id) f_score,6-NTILE(5) OVER(ORDER BY money DESC,customer_id) m_score FROM a) SELECT b.customer_id,1095-d.day_index recency_days,freq,money net_cents,r_score,f_score,m_score,CASE WHEN r_score+f_score+m_score>=13 THEN 'high_value' WHEN r_score+f_score+m_score<=6 THEN 'low_activity' ELSE 'regular' END segment FROM b JOIN calendar_days d ON d.day=b.last_day ORDER BY b.customer_id;
```

最新公开结果共 1794 行，完整结果见 results/BP12.json。

先按客户聚合。三种独立窗口分箱。按总分分类。计算距截止日天数。每行订单做NTILE会将同一客户拆入多组。

## BP13 首购月份留存矩阵

线上有效订单；首次购买月为同期群，观察第0至第6月；按首购月与月偏移输出同期群规模、活跃客户与留存率；没有活跃但已观察的月份为0，未来月份不输出。

输出列为 cohort, month_offset, cohort_size, active_customers, retention_pct。

```sql
WITH a AS (SELECT customer_id,MIN(SUBSTR(order_date,1,7)) cohort FROM v_order_net WHERE channel='online' GROUP BY customer_id), b AS (SELECT cohort,COUNT(*) n FROM a GROUP BY cohort), m AS (SELECT DISTINCT month_key FROM calendar_days WHERE day<='2025-12-31'), x AS (SELECT b.cohort,m.month_key,b.n,(CAST(SUBSTR(m.month_key,1,4) AS SIGNED)-CAST(SUBSTR(b.cohort,1,4) AS SIGNED))*12+CAST(SUBSTR(m.month_key,6,2) AS SIGNED)-CAST(SUBSTR(b.cohort,6,2) AS SIGNED) k FROM b CROSS JOIN m WHERE m.month_key>=b.cohort), y AS (SELECT a.cohort,SUBSTR(o.order_date,1,7) m,COUNT(DISTINCT o.customer_id) active FROM a JOIN v_order_net o ON o.customer_id=a.customer_id AND o.channel='online' GROUP BY a.cohort,SUBSTR(o.order_date,1,7)) SELECT x.cohort,x.k month_offset,x.n cohort_size,COALESCE(y.active,0) active_customers,ROUND(100.0*COALESCE(y.active,0)/x.n,2) retention_pct FROM x LEFT JOIN y ON y.cohort=x.cohort AND y.m=x.month_key WHERE x.k BETWEEN 0 AND 6 ORDER BY x.cohort,x.k;
```

最新公开结果共 231 行，完整结果见 results/BP13.json。

确定首购月份。构造可观测月份。去重客户。计算留存。直接COUNT订单会把同一客户的多次复购重复计数。

## BP14 营销渠道转化与获客成本

以2025-01-01至2025-12-31发生的访问会话为观察总体，按会话渠道归因。转化会话是这些会话中截至2025-12-31关联至少一张有效线上订单的不同会话，转化率=转化会话数/观察会话数。新客仅计历史首次有效线上订单在该观察会话内发生且订单日期在2025年的客户，首次按订单日期、订单编号决胜。净收入广告回报的收入同样只取观察会话内2025年有效线上订单的净额。广告支出按渠道2025年月份汇总，获客成本=广告支出/新客数。保留全部渠道，无会话和无转化计0，缺少广告预算记录的支出及相关比率为NULL，零分母为NULL。获客成本保留2位、回报倍数4位、百分比2位小数。

输出列为 source_id, sessions, converted, conversion_pct, new_customers, spend_cents, cac_cents, roas。

```sql
WITH s AS (SELECT source_id,COUNT(*) sessions FROM customer_sessions WHERE session_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY source_id), o AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY customer_id ORDER BY order_date,order_id) rn FROM v_order_net WHERE channel='online'), a AS (SELECT t.source_id,COUNT(DISTINCT o.session_id) converted,SUM(CASE WHEN rn=1 THEN 1 ELSE 0 END) new_customers,SUM(net_cents) net FROM o JOIN customer_sessions t ON t.session_id=o.session_id WHERE t.session_date BETWEEN '2025-01-01' AND '2025-12-31' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY t.source_id), p AS (SELECT source_id,SUM(spend_cents) spend FROM marketing_campaigns WHERE month_key BETWEEN '2025-01' AND '2025-12' GROUP BY source_id) SELECT t.source_id,COALESCE(s.sessions,0) sessions,COALESCE(a.converted,0) converted,ROUND(100.0*COALESCE(a.converted,0)/NULLIF(s.sessions,0),2) conversion_pct,COALESCE(a.new_customers,0) new_customers,p.spend spend_cents,ROUND(1.0*p.spend/NULLIF(a.new_customers,0),2) cac_cents,ROUND(1.0*a.net/NULLIF(p.spend,0),4) roas FROM traffic_sources t LEFT JOIN s ON s.source_id=t.source_id LEFT JOIN a ON a.source_id=t.source_id LEFT JOIN p ON p.source_id=t.source_id ORDER BY t.source_id;
```

最新公开结果共 5 行，完整结果见 results/BP14.json。

确定期间访问会话总体。在完整历史上识别首购。在同一会话总体内统计转化和净收入。独立汇总广告支出并保留无访问渠道。跨年会话不能只凭订单日期进入当年转化分子；不同订单共享会话时会话只计一次。

## BP15 高价值流失风险客户

截至2025年底所有线上有效购买客户；历史订单数≥3、历史净金额排名前20%（NTILE(5)，按编号决胜）、最近90日无消费，输出历史毛利、最近购买距今天数和风险优先级（毛利降序）。

输出列为 customer_id, freq, net_cents, gross_cents, recency_days。

```sql
WITH a AS (SELECT customer_id,COUNT(*) freq,MAX(order_date) last_day,SUM(net_cents) net,SUM(net_cents-cost_cents) gross FROM v_order_net WHERE channel='online' GROUP BY customer_id), b AS (SELECT *,NTILE(5) OVER(ORDER BY net DESC,customer_id) bucket FROM a) SELECT b.customer_id,freq,net net_cents,gross gross_cents,1095-d.day_index recency_days FROM b JOIN calendar_days d ON d.day=b.last_day WHERE bucket=1 AND freq>=3 AND 1095-d.day_index>=90 ORDER BY gross DESC,b.customer_id;
```

最新公开结果共 106 行，完整结果见 results/BP15.json。

汇总历史价值。在全体客户上分位。计算距截止日天数。筛风险名单。仅凭最后消费日期无法识别高价值，且流失风险不是已流失事实。
