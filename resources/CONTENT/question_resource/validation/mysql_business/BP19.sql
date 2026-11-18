-- 银行流水与凭证全量对账
-- 题目资源4.2.1，原生MySQL8.4尚未验证

WITH a AS (
  SELECT 0 unreferenced, reference_no ref, SUM(expense_cents) ledger
  FROM v_expenses WHERE entry_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY reference_no
), b AS (
  SELECT CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END unreferenced,
    COALESCE(reference_no,CAST(bank_id AS CHAR)) ref, SUM(-amount_cents) bank
  FROM bank_transactions WHERE transaction_date BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END,COALESCE(reference_no,CAST(bank_id AS CHAR))
), k AS (
  SELECT unreferenced,ref FROM a UNION SELECT unreferenced,ref FROM b
)
SELECT CASE WHEN k.unreferenced=1 THEN CONCAT('BANK-',k.ref) ELSE k.ref END ref,
  a.ledger ledger_cents,b.bank bank_cents,COALESCE(b.bank,0)-COALESCE(a.ledger,0) difference_cents,
  CASE WHEN a.ref IS NULL THEN 'bank_only' WHEN b.ref IS NULL THEN 'ledger_only' ELSE 'difference' END issue,
  CASE WHEN k.unreferenced=1 THEN 'unreferenced_bank' ELSE 'reference' END reference_kind
FROM k LEFT JOIN a ON a.ref=k.ref AND a.unreferenced=k.unreferenced
LEFT JOIN b ON b.ref=k.ref AND b.unreferenced=k.unreferenced
WHERE a.ref IS NULL OR b.ref IS NULL OR a.ledger<>b.bank ORDER BY ref,reference_kind;

WITH a AS (
  SELECT 0 unreferenced, reference_no ref, SUM(expense_cents) ledger
  FROM v_expenses WHERE (entry_date>='2025-01-01' AND entry_date<='2025-12-31') GROUP BY reference_no
), b AS (
  SELECT CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END unreferenced,
    COALESCE(reference_no,CAST(bank_id AS CHAR)) ref, SUM(-amount_cents) bank
  FROM bank_transactions WHERE (transaction_date>='2025-01-01' AND transaction_date<='2025-12-31')
  GROUP BY CASE WHEN reference_no IS NULL THEN 1 ELSE 0 END,COALESCE(reference_no,CAST(bank_id AS CHAR))
), k AS (
  SELECT unreferenced,ref FROM a UNION SELECT unreferenced,ref FROM b
)
SELECT CASE WHEN k.unreferenced=1 THEN CONCAT('BANK-',k.ref) ELSE k.ref END ref,
  a.ledger ledger_cents,b.bank bank_cents,COALESCE(b.bank,0)-COALESCE(a.ledger,0) difference_cents,
  CASE WHEN a.ref IS NULL THEN 'bank_only' WHEN b.ref IS NULL THEN 'ledger_only' ELSE 'difference' END issue,
  CASE WHEN k.unreferenced=1 THEN 'unreferenced_bank' ELSE 'reference' END reference_kind
FROM k LEFT JOIN a ON a.ref=k.ref AND a.unreferenced=k.unreferenced
LEFT JOIN b ON b.ref=k.ref AND b.unreferenced=k.unreferenced
WHERE a.ref IS NULL OR b.ref IS NULL OR a.ledger<>b.bank ORDER BY ref,reference_kind;
