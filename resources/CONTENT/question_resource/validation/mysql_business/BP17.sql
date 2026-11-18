-- 供应商发票与付款核对
-- 题目资源4.2.1，原生MySQL8.4尚未验证

SELECT supplier_invoice_id,supplier_id,billed_cents,paid_cents,balance_cents,CASE WHEN balance_cents=0 THEN 'paid' WHEN paid_cents=0 THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END payment_state FROM v_invoice_balance ORDER BY balance_cents DESC,supplier_invoice_id;

SELECT supplier_invoice_id,supplier_id,billed_cents,paid_cents,balance_cents,CASE WHEN balance_cents IN (0) THEN 'paid' WHEN paid_cents IN (0) THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END payment_state FROM v_invoice_balance ORDER BY balance_cents DESC,supplier_invoice_id;
