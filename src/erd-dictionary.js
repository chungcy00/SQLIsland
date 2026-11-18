// Display-only annotations for the existing audited business views. Constraints always come from SQLite.
const views = {
  v_sales_lines: "有效销售明细，扣除截至截止日的退货与退款",
  v_order_net: "订单级净销售与成本汇总",
  v_expenses: "费用科目借贷净额，关联原始凭证",
  v_staff_month: "员工月度薪资、考勤与教学人工成本",
  v_invoice_balance: "供应商应付余额，已扣批准贷项及实付",
  v_po_lines: "有效采购明细及截至截止日的交付、开票汇总",
};
const columns = {
  order_item_id: "订单明细编号",
  order_id: "订单编号",
  store_id: "门店编号",
  customer_id: "客户编号",
  session_id: "访问会话编号",
  channel: "订单渠道",
  order_date: "订单日期",
  product_id: "商品编号",
  promotion_id: "实际使用的促销活动编号",
  net_qty: "扣除退货后的净销售件数",
  net_cents: "扣除退款后的净销售金额（马币分）",
  cost_cents: "净销售数量对应的历史标准成本（马币分）",
  discount_cents: "销售折扣（马币分）",
  refund_cents: "截至截止日的退款金额（马币分）",
  entry_id: "会计凭证编号",
  entry_date: "凭证日期",
  department_id: "部门编号",
  reference_no: "业务参考号",
  account_id: "会计科目编号",
  expense_cents: "费用借方减贷方净额（马币分）",
  employee_id: "员工编号",
  month_key: "薪资所属月份",
  position_id: "当月最后在职岗位编号",
  base_cents: "当月实付基本工资（马币分）",
  bonus_cents: "当月奖金（马币分）",
  overtime_minutes: "当月加班分钟数",
  worked_minutes: "当月工作分钟数",
  labor_cents: "工资、奖金及教学加班估算成本（马币分）",
  supplier_invoice_id: "供应商发票编号",
  po_id: "采购订单编号",
  supplier_id: "供应商编号",
  invoice_no: "供应商业务发票号码",
  invoice_date: "开票日期",
  due_date: "付款到期日",
  billed_cents: "开票金额（马币分）",
  paid_cents: "截至截止日的实付金额（马币分）",
  balance_cents: "扣除批准贷项及实付后的应付余额（马币分）",
  po_item_id: "采购明细编号",
  warehouse_id: "收货仓库编号",
  promised_date: "承诺交付日期",
  quantity_ordered: "采购数量",
  unit_price_cents: "采购单价（马币分）",
  ordered_cents: "采购数量乘单价（马币分）",
  received: "累计收货数量，包含拒收",
  accepted: "扣除质量拒收的合格数量",
  on_time: "承诺日及之前收到的合格数量",
  billed: "累计开票数量",
};
export function businessErdDictionary(dictionary) {
  const annotated = { ...dictionary, views: { ...dictionary.views } };
  for (const [name, description] of Object.entries(views)) {
    if (!dictionary.views?.[name]) continue;
    const prior =
      typeof dictionary.views[name] === "object" ? dictionary.views[name] : {};
    annotated.views[name] = {
      ...prior,
      description: prior.description || description,
      columns: Object.entries(columns).map(([name, description]) => ({
        name,
        description,
      })),
    };
  }
  if (annotated.views.v_invoice_balance)
    annotated.views.v_invoice_balance.columns =
      annotated.views.v_invoice_balance.columns.map((column) =>
        column.name === "billed_cents"
          ? { ...column, description: "开票面额减批准贷项后的净应付（马币分）" }
          : column,
      );
  return annotated;
}
