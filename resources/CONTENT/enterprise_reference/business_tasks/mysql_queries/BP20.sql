WITH f AS (
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
WHERE duplicate_flag+large_flag+overpay_flag+mismatch_flag>0 ORDER BY flags DESC,supplier_invoice_id;
