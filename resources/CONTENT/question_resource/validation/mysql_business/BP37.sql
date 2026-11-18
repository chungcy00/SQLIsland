-- 供应商延迟与仓库资金压力
-- 题目资源4.2.1，原生MySQL8.4尚未验证

WITH a AS (
  SELECT supplier_id,warehouse_id,product_id,SUM((quantity_ordered-accepted)*unit_price_cents) overdue_value
  FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31' AND quantity_ordered>accepted
  GROUP BY supplier_id,warehouse_id,product_id
)
SELECT a.supplier_id,COUNT(*) affected_pairs,SUM(a.overdue_value) overdue_cents,
  CASE WHEN COUNT(i.snapshot_id)=COUNT(*) THEN SUM(i.quantity*i.unit_cost_cents) ELSE NULL END exposed_stock_cents
FROM a LEFT JOIN inventory_snapshots i ON i.warehouse_id=a.warehouse_id AND i.product_id=a.product_id
  AND i.snapshot_date='2025-12-31'
GROUP BY a.supplier_id ORDER BY overdue_cents DESC,a.supplier_id;

WITH a AS (
  SELECT supplier_id,warehouse_id,product_id,SUM((quantity_ordered-accepted)*unit_price_cents) overdue_value
  FROM v_po_lines WHERE (promised_date>='2025-01-01' AND promised_date<='2025-12-31') AND quantity_ordered>accepted
  GROUP BY supplier_id,warehouse_id,product_id
)
SELECT a.supplier_id,COUNT(*) affected_pairs,SUM(a.overdue_value) overdue_cents,
  CASE WHEN COUNT(i.snapshot_id)=COUNT(*) THEN SUM(i.quantity*i.unit_cost_cents) ELSE NULL END exposed_stock_cents
FROM a LEFT JOIN inventory_snapshots i ON i.warehouse_id=a.warehouse_id AND i.product_id=a.product_id
  AND i.snapshot_date='2025-12-31'
GROUP BY a.supplier_id ORDER BY overdue_cents DESC,a.supplier_id;
