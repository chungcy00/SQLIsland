# finance 企业实战

题目资源 4.2.1，数据库 4.2.0。

## BP16 预算与实际费用差异

2025年部门×费用科目，预算与费用分录各自汇总，偏差=实际-预算；超过预算10%标记；保留有预算但没有发生额的项目；分母为零返回NULL。

输出列为 department_id, account_id, budget_cents, actual_cents, variance_cents, variance_pct, over_budget。

```sql
WITH b AS (SELECT department_id,account_id,SUM(budget_cents) budget FROM budgets WHERE month_key BETWEEN '2025-01' AND '2025-12' GROUP BY department_id,account_id), a AS (SELECT department_id,account_id,SUM(expense_cents) actual FROM v_expenses WHERE entry_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY department_id,account_id) SELECT b.department_id,b.account_id,b.budget budget_cents,COALESCE(a.actual,0) actual_cents,COALESCE(a.actual,0)-b.budget variance_cents,ROUND(100.0*(COALESCE(a.actual,0)-b.budget)/NULLIF(b.budget,0),2) variance_pct,CASE WHEN COALESCE(a.actual,0)>b.budget*1.1 THEN 1 ELSE 0 END over_budget FROM b LEFT JOIN a ON a.department_id=b.department_id AND a.account_id=b.account_id ORDER BY b.department_id,b.account_id;
```

最新公开结果共 35 行，完整结果见 results/BP16.json。

预算单独聚合。费用独立聚合。合并并计算差异。预算按月存在，连接分录后再求和会放大预算。

## BP17 供应商发票与付款核对

所有截至12-31的供应商发票，汇总付款；输出发票金额、实付金额、余额和未付/部分/足额/超额状态。按余额倒序。 paid表示已结清，包含已批准贷项全额抵销而无需付现的情况。 本库v_invoice_balance的billed_cents为发票面额减截至截止日已批准贷项后的净应付，paid_cents仅计截止日前付款；原始发票面额保留在supplier_invoice_items。

输出列为 supplier_invoice_id, supplier_id, billed_cents, paid_cents, balance_cents, payment_state。

```sql
SELECT supplier_invoice_id,supplier_id,billed_cents,paid_cents,balance_cents,CASE WHEN balance_cents=0 THEN 'paid' WHEN paid_cents=0 THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END payment_state FROM v_invoice_balance ORDER BY balance_cents DESC,supplier_invoice_id;
```

最新公开结果共 4739 行，完整结果见 results/BP17.json。

先检查发票行与付款的预聚合视图。比较金额与余额。分类。不能直接将多笔付款与多行发票明细同时连接后求和。

## BP18 应付账款账龄

截至2025-12-31，余额>0；按到期日分为未逾期（到期日≥截止日）、1—30、31—60、61—90、90日以上；按供应商与账龄汇总发票数及应付余额。日期差用日历索引；到期日可能超出年底，先判未逾期。 本库v_invoice_balance的billed_cents为发票面额减截至截止日已批准贷项后的净应付，paid_cents仅计截止日前付款；原始发票面额保留在supplier_invoice_items。

输出列为 supplier_id, bucket, invoices, outstanding_cents。

```sql
WITH a AS (SELECT v.*,CASE WHEN due_date>='2025-12-31' THEN 'current' WHEN due_date>='2025-12-01' THEN '01-30' WHEN due_date>='2025-11-01' THEN '31-60' WHEN due_date>='2025-10-02' THEN '61-90' ELSE '90+' END bucket FROM v_invoice_balance v WHERE balance_cents>0) SELECT supplier_id,bucket,COUNT(*) invoices,SUM(balance_cents) outstanding_cents FROM a GROUP BY supplier_id,bucket ORDER BY supplier_id,bucket;
```

最新公开结果共 153 行，完整结果见 results/BP18.json。

先取截止日余额。按固定日期边界分箱。聚合供应商应付。账龄基于到期日，不是发票日期；未到期不能算逾期。

## BP19 银行流水与凭证全量对账

2025年费用凭证按真实reference_no汇总费用净额；银行按真实reference_no汇总净支出，净支出=-SUM(amount_cents)，正向冲回或收入作为负支出，不能逐行取ABS。采用两端全量键集合，每条NULL银行参考号单独对账，并用reference_kind区分reference与unreferenced_bank，防止合成显示名BANK-编号与真实参考号碰撞。返回有缺失或金额差异的记录，差额=银行净支出-账簿费用；缺失端输出NULL。显示ref为真实参考号或BANK-银行编号。按ref升序、reference_kind升序。

输出列为 ref, ledger_cents, bank_cents, difference_cents, issue, reference_kind。

```sql
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
```

最新公开结果共 1182 行，完整结果见 results/BP19.json。

按真实参考号分别汇总有符号金额。给无参考号流水独立类型及编号键。合并两端完整键集合。筛选缺失与金额差异。逐行ABS会掩盖银行冲回；只用BANK-编号作为键可能与真实参考号合并。

## BP20 多规则异常交易筛查

截至2025-12-31的每张发票计算四个复核标记：同供应商同invoice_no存在多张发票；原始发票面额超过该供应商全部期间内发票面额均值的2倍；净应付减实付余额为负；原始发票面额与本张发票已开票数量按对应采购行单价重算金额相差超过100分。面额及采购重算金额均在本张发票行内汇总，不能使用整张采购单总收货金额，不冲减贷项；超额付款标记使用截止日已批准贷项后的净应付。数量是否超收或超开票由三方核对题检查，本题第四项专门识别开票价格差异。输出净应付billed_cents和四个标记，至少一个标记才返回，按标记数降序、发票编号升序。大额及价格标记使用未舍入值，标记只代表复核候选。

输出列为 supplier_invoice_id, supplier_id, billed_cents, duplicate_flag, large_flag, overpay_flag, mismatch_flag, flags。

```sql
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
```

最新公开结果共 984 行，完整结果见 results/BP20.json。

按发票汇总原始面额和采购价重算金额。在供应商内计算面额基准与重复号码。独立取截止日贷项和付款余额。累计四项标记。分批发票不能与整单收货金额比较；已批准贷项不应自动变成发票单价错误。
