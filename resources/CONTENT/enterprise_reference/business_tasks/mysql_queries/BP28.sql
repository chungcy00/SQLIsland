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
