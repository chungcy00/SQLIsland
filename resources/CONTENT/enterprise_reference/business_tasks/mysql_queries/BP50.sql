WITH qm AS (
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
FROM compared ORDER BY q;
