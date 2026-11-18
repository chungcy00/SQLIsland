-- 供应商准时、完整交付与质量
-- 题目资源4.2.1，原生MySQL8.4尚未验证

SELECT supplier_id,COUNT(*) due_lines,ROUND(100.0*SUM(CASE WHEN on_time>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) ontime_pct,ROUND(100.0*SUM(CASE WHEN accepted>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) complete_pct,ROUND(100.0*SUM(accepted)/NULLIF(SUM(received),0),2) quality_pct FROM v_po_lines WHERE promised_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY supplier_id ORDER BY supplier_id;

SELECT supplier_id,COUNT(*) due_lines,ROUND(100.0*SUM(CASE WHEN on_time>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) ontime_pct,ROUND(100.0*SUM(CASE WHEN accepted>=quantity_ordered THEN 1 ELSE 0 END)/COUNT(*),2) complete_pct,ROUND(100.0*SUM(accepted)/NULLIF(SUM(received),0),2) quality_pct FROM v_po_lines WHERE (promised_date>='2025-01-01' AND promised_date<='2025-12-31') GROUP BY supplier_id ORDER BY supplier_id;
