# procurement 数据字典

资源 4.2.0。金额为整数马币分，日期为左闭右开任职区间或业务实际发生日。

退款按原销售日期归属，截至2025-12-31。采购发票面额、批准贷项和实付分别留存。调拨发出与收货分日入账，截止日未到货保留在途，库龄为本仓入库库龄。期初库存按模型事前需求预测建立，缺货可转待处理订单，超30日未完成订单关闭。促销门槛以折前篮子金额计，活动重叠不叠加，门店、渠道、品类和会员条件同时校验。

## categories

商品分类，15 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| category_id | BIGINT | 否 | 主键/标识 |
| category_name | VARCHAR(160) | 否 | 名称 |

```sql
CREATE TABLE categories (
  category_id BIGINT PRIMARY KEY,
  category_name VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## products

商品主档，500 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| product_id | BIGINT | 否 | 主键/标识 |
| category_id | BIGINT | 否 | 主键/标识 |
| product_name | VARCHAR(160) | 否 | 名称 |
| list_price_cents | BIGINT | 否 | 金额（马币分） |
| reorder_level | INT | 否 | 业务字段 |
| active | INT | 否 | 有效标志 1/0 |
| discontinued_date | DATE | 是 | 停止销售日期，NULL为仍在售 |

```sql
CREATE TABLE products (
  product_id BIGINT PRIMARY KEY,
  category_id BIGINT NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  list_price_cents BIGINT NOT NULL CHECK(list_price_cents>=0),
  reorder_level INT NOT NULL CHECK(reorder_level>=0),
  active INT NOT NULL CHECK(active IN (0,1)),
  discontinued_date DATE,
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## suppliers

供应商主档，60 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| supplier_id | BIGINT | 否 | 主键/标识 |
| supplier_name | VARCHAR(160) | 否 | 名称 |
| region | VARCHAR(160) | 否 | 区域（客户可缺失） |

```sql
CREATE TABLE suppliers (
  supplier_id BIGINT PRIMARY KEY,
  supplier_name VARCHAR(160) NOT NULL,
  region VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## warehouses

配送仓主档，3 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| warehouse_id | BIGINT | 否 | 主键/标识 |
| warehouse_name | VARCHAR(160) | 否 | 名称 |

```sql
CREATE TABLE warehouses (
  warehouse_id BIGINT PRIMARY KEY,
  warehouse_name VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## supplier_contracts

年度采购合同价格，4405 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| contract_id | BIGINT | 否 | 主键/标识 |
| supplier_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| start_date | DATE | 否 | 日期（YYYY-MM-DD） |
| end_date | DATE | 否 | 日期（YYYY-MM-DD） |
| unit_price_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE supplier_contracts (
  contract_id BIGINT PRIMARY KEY,
  supplier_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  unit_price_cents BIGINT NOT NULL CHECK(unit_price_cents>=0),
  UNIQUE(supplier_id,product_id,start_date),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## purchase_orders

采购订单，5000 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| po_id | BIGINT | 否 | 主键/标识 |
| supplier_id | BIGINT | 否 | 主键/标识 |
| warehouse_id | BIGINT | 否 | 主键/标识 |
| order_date | DATE | 否 | 日期（YYYY-MM-DD） |
| promised_date | DATE | 否 | 日期（YYYY-MM-DD） |
| status | VARCHAR(160) | 否 | 业务状态（见表约束及口径） |
| order_priority | VARCHAR(160) | 否 | normal常规或urgent紧急采购 |
| cancellation_date | DATE | 是 | 采购取消日期，正常订单为NULL |

```sql
CREATE TABLE purchase_orders (
  po_id BIGINT PRIMARY KEY,
  supplier_id BIGINT NOT NULL,
  warehouse_id BIGINT NOT NULL,
  order_date DATE NOT NULL,
  promised_date DATE NOT NULL,
  status VARCHAR(160) NOT NULL CHECK(status IN ('placed','cancelled','closed')),
  order_priority VARCHAR(160) NOT NULL DEFAULT 'normal',
  cancellation_date DATE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## purchase_order_items

采购明细，9993 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| po_item_id | BIGINT | 否 | 主键/标识 |
| po_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| contract_id | BIGINT | 否 | 主键/标识 |
| quantity_ordered | INT | 否 | 订购件数 |
| unit_price_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE purchase_order_items (
  po_item_id BIGINT PRIMARY KEY,
  po_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  contract_id BIGINT NOT NULL,
  quantity_ordered INT NOT NULL CHECK(quantity_ordered>0),
  unit_price_cents BIGINT NOT NULL CHECK(unit_price_cents>=0),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (contract_id) REFERENCES supplier_contracts(contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## goods_receipts

收货与质检数量，10946 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| receipt_id | BIGINT | 否 | 主键/标识 |
| po_item_id | BIGINT | 否 | 主键/标识 |
| receipt_date | DATE | 否 | 日期（YYYY-MM-DD） |
| quantity_received | INT | 否 | 实际收货件数（含拒收） |
| quantity_rejected | INT | 否 | 拒收件数 |

```sql
CREATE TABLE goods_receipts (
  receipt_id BIGINT PRIMARY KEY,
  po_item_id BIGINT NOT NULL,
  receipt_date DATE NOT NULL,
  quantity_received INT NOT NULL CHECK(quantity_received>0),
  quantity_rejected INT NOT NULL CHECK(quantity_rejected>=0),
  CHECK(quantity_rejected<=quantity_received),
  FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(po_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## supplier_invoices

供应商发票头，4739 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| supplier_invoice_id | BIGINT | 否 | 主键/标识 |
| po_id | BIGINT | 否 | 主键/标识 |
| invoice_no | VARCHAR(160) | 否 | 供应商发票业务编号（可重复异常） |
| invoice_date | DATE | 否 | 日期（YYYY-MM-DD） |
| due_date | DATE | 否 | 日期（YYYY-MM-DD） |

```sql
CREATE TABLE supplier_invoices (
  supplier_invoice_id BIGINT PRIMARY KEY,
  po_id BIGINT NOT NULL,
  invoice_no VARCHAR(160) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## supplier_invoice_items

供应商发票明细，9459 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| supplier_invoice_item_id | BIGINT | 否 | 主键/标识 |
| supplier_invoice_id | BIGINT | 否 | 主键/标识 |
| po_item_id | BIGINT | 否 | 主键/标识 |
| quantity_billed | INT | 否 | 开票件数 |
| unit_price_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE supplier_invoice_items (
  supplier_invoice_item_id BIGINT PRIMARY KEY,
  supplier_invoice_id BIGINT NOT NULL,
  po_item_id BIGINT NOT NULL,
  quantity_billed INT NOT NULL CHECK(quantity_billed>0),
  unit_price_cents BIGINT NOT NULL CHECK(unit_price_cents>=0),
  FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(supplier_invoice_id),
  FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(po_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## v_po_lines

```sql
CREATE VIEW v_po_lines AS SELECT i.po_item_id,i.po_id,p.supplier_id,p.warehouse_id,p.order_date,p.promised_date,i.product_id,i.quantity_ordered,i.unit_price_cents,i.quantity_ordered*i.unit_price_cents AS ordered_cents,COALESCE(r.received,0) received,COALESCE(r.accepted,0) accepted,COALESCE(r.on_time,0) on_time,COALESCE(b.billed,0) billed,COALESCE(b.billed_cents,0) billed_cents FROM purchase_order_items i JOIN purchase_orders p ON p.po_id=i.po_id LEFT JOIN (SELECT g.po_item_id,SUM(g.quantity_received) received,SUM(g.quantity_received-g.quantity_rejected) accepted,SUM(CASE WHEN g.receipt_date<=p.promised_date THEN g.quantity_received-g.quantity_rejected ELSE 0 END) on_time FROM goods_receipts g JOIN purchase_order_items i ON i.po_item_id=g.po_item_id JOIN purchase_orders p ON p.po_id=i.po_id WHERE g.receipt_date<='2025-12-31' GROUP BY g.po_item_id) r ON r.po_item_id=i.po_item_id LEFT JOIN (SELECT po_item_id,SUM(quantity_billed) billed,SUM(quantity_billed*unit_price_cents) billed_cents FROM supplier_invoice_items GROUP BY po_item_id) b ON b.po_item_id=i.po_item_id WHERE p.status<>'cancelled' AND p.order_date<='2025-12-31';
```
