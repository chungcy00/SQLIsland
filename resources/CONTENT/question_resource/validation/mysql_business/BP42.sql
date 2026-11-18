-- 三方不一致且已经付款的发票
-- 题目资源4.2.1，原生MySQL8.4尚未验证

WITH receipts AS (
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
ORDER BY ABS(b.billed_cents-a.received) DESC,b.supplier_invoice_id;

WITH receipts AS (
  SELECT po_item_id,SUM(quantity_received-quantity_rejected) accepted
  FROM goods_receipts WHERE receipt_date<='2025-12-31' GROUP BY po_item_id
), lines AS (
  SELECT x.*,p.unit_price_cents po_price,IFNULL(r.accepted,0) accepted,
    IFNULL(SUM(x.quantity_billed) OVER(PARTITION BY x.po_item_id
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
ORDER BY ABS(b.billed_cents-a.received) DESC,b.supplier_invoice_id;
