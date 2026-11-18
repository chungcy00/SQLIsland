# inventory 数据字典

资源 4.2.0。金额为整数马币分，日期为左闭右开任职区间或业务实际发生日。

退款按原销售日期归属，截至2025-12-31。采购发票面额、批准贷项和实付分别留存。调拨发出与收货分日入账，截止日未到货保留在途，库龄为本仓入库库龄。期初库存按模型事前需求预测建立，缺货可转待处理订单，超30日未完成订单关闭。促销门槛以折前篮子金额计，活动重叠不叠加，门店、渠道、品类和会员条件同时校验。

## calendar_days

连续日期维度，1096 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| day | DATE | 否 | 日历日期 |
| month_key | CHAR(7) | 否 | 统计月份 YYYY-MM |
| day_index | INT | 否 | 从2023-01-01开始的日序号（0起） |

```sql
CREATE TABLE calendar_days (
  day DATE PRIMARY KEY,
  month_key CHAR(7) NOT NULL,
  day_index INT NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## stores

门店主档，12 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| store_id | BIGINT | 否 | 主键/标识 |
| store_name | VARCHAR(160) | 否 | 名称 |
| city | VARCHAR(160) | 否 | 业务字段 |
| fulfillment_warehouse_id | BIGINT | 是 | 门店对应区域配送仓 |

```sql
CREATE TABLE stores (
  store_id BIGINT PRIMARY KEY,
  store_name VARCHAR(160) NOT NULL,
  city VARCHAR(160) NOT NULL,
  fulfillment_warehouse_id BIGINT,
  FOREIGN KEY (fulfillment_warehouse_id) REFERENCES warehouses(warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

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

## customers

客户主档（虚构），5000 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| customer_id | BIGINT | 否 | 主键/标识 |
| customer_name | VARCHAR(160) | 否 | 名称 |
| signup_date | DATE | 否 | 日期（YYYY-MM-DD） |
| region | VARCHAR(160) | 是 | 区域（客户可缺失） |
| member_since_date | DATE | 是 | 入会日期，NULL表示未入会 |

```sql
CREATE TABLE customers (
  customer_id BIGINT PRIMARY KEY,
  customer_name VARCHAR(160) NOT NULL,
  signup_date DATE NOT NULL,
  region VARCHAR(160),
  member_since_date DATE
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

## product_costs

标准成本历史，3271 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| cost_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| effective_date | DATE | 否 | 日期（YYYY-MM-DD） |
| unit_cost_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE product_costs (
  cost_id BIGINT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  effective_date DATE NOT NULL,
  unit_cost_cents BIGINT NOT NULL CHECK(unit_cost_cents>=0),
  UNIQUE(product_id,effective_date),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## promotions

促销期间，44 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| promotion_id | BIGINT | 否 | 主键/标识 |
| promotion_name | VARCHAR(160) | 否 | 名称 |
| start_date | DATE | 否 | 日期（YYYY-MM-DD） |
| end_date | DATE | 否 | 日期（YYYY-MM-DD） |
| campaign_type | VARCHAR(160) | 否 | 活动性质，节庆/会员/清仓/限时/季节 |
| channel_scope | VARCHAR(160) | 否 | 适用渠道all/store/online |
| store_scope | VARCHAR(160) | 否 | all全门店或selected指定门店，见promotion_stores |
| category_scope | VARCHAR(160) | 否 | all全品类或selected指定品类，见promotion_categories |
| members_only | INT | 否 | 是否仅限在交易日前入会的会员 |
| min_basket_cents | BIGINT | 否 | 订单折前金额门槛，马币分 |
| discount_basis_points | INT | 否 | 优惠率，万分比，明细优惠按半分向上取整到分 |
| demand_change_bp | INT | 否 | 虚构模型需求效应参数，可负，不能作为实证因果结论 |

```sql
CREATE TABLE promotions (
  promotion_id BIGINT PRIMARY KEY,
  promotion_name VARCHAR(160) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  campaign_type VARCHAR(160) NOT NULL DEFAULT 'festive',
  channel_scope VARCHAR(160) NOT NULL DEFAULT 'all',
  store_scope VARCHAR(160) NOT NULL DEFAULT 'all',
  category_scope VARCHAR(160) NOT NULL DEFAULT 'all',
  members_only INT NOT NULL DEFAULT 0,
  min_basket_cents BIGINT NOT NULL DEFAULT 0,
  discount_basis_points INT NOT NULL DEFAULT 0,
  demand_change_bp INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## traffic_sources

线上访问渠道，5 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| source_id | BIGINT | 否 | 主键/标识 |
| source_name | VARCHAR(160) | 否 | 名称 |

```sql
CREATE TABLE traffic_sources (
  source_id BIGINT PRIMARY KEY,
  source_name VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## customer_sessions

访问会话，50000 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| session_id | BIGINT | 否 | 主键/标识 |
| customer_id | BIGINT | 否 | 主键/标识 |
| source_id | BIGINT | 否 | 主键/标识 |
| session_date | DATE | 否 | 日期（YYYY-MM-DD） |

```sql
CREATE TABLE customer_sessions (
  session_id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  source_id BIGINT NOT NULL,
  session_date DATE NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (source_id) REFERENCES traffic_sources(source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## orders

销售订单（线上线下统一），30000 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| order_id | BIGINT | 否 | 主键/标识 |
| store_id | BIGINT | 是 | 主键/标识 |
| customer_id | BIGINT | 是 | 主键/标识 |
| session_id | BIGINT | 是 | 主键/标识 |
| order_date | DATE | 否 | 日期（YYYY-MM-DD） |
| channel | VARCHAR(160) | 否 | store 线下 / online 线上 |
| status | VARCHAR(160) | 否 | 业务状态（见表约束及口径） |
| cancellation_reason | VARCHAR(160) | 是 | 取消原因，正常完成或待处理为NULL |

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  store_id BIGINT,
  customer_id BIGINT,
  session_id BIGINT,
  order_date DATE NOT NULL,
  channel VARCHAR(160) NOT NULL CHECK(channel IN ('store','online')),
  status VARCHAR(160) NOT NULL CHECK(status IN ('completed','cancelled','pending')),
  cancellation_reason VARCHAR(160),
  CHECK((channel='online' AND store_id IS NULL AND session_id IS NOT NULL) OR (channel='store' AND store_id IS NOT NULL AND session_id IS NULL)),
  FOREIGN KEY (store_id) REFERENCES stores(store_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (session_id) REFERENCES customer_sessions(session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## order_items

销售明细，90074 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| order_item_id | BIGINT | 否 | 主键/标识 |
| order_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| promotion_id | BIGINT | 是 | 主键/标识 |
| quantity | INT | 否 | 数量（件） |
| unit_price_cents | BIGINT | 否 | 金额（马币分） |
| discount_cents | BIGINT | 否 | 金额（马币分） |
| unit_cost_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE order_items (
  order_item_id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  promotion_id BIGINT,
  quantity INT NOT NULL CHECK(quantity>0),
  unit_price_cents BIGINT NOT NULL CHECK(unit_price_cents>=0),
  discount_cents BIGINT NOT NULL CHECK(discount_cents>=0),
  unit_cost_cents BIGINT NOT NULL CHECK(unit_cost_cents>=0),
  CHECK(discount_cents<=quantity*unit_price_cents),
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## returns

退货/退款，5063 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| return_id | BIGINT | 否 | 主键/标识 |
| order_item_id | BIGINT | 否 | 主键/标识 |
| return_date | DATE | 否 | 日期（YYYY-MM-DD） |
| quantity | INT | 否 | 数量（件） |
| refund_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE returns (
  return_id BIGINT PRIMARY KEY,
  order_item_id BIGINT NOT NULL,
  return_date DATE NOT NULL,
  quantity INT NOT NULL CHECK(quantity>0),
  refund_cents BIGINT NOT NULL CHECK(refund_cents>=0),
  FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id)
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

## inventory_opening

2023年初库存，1500 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| opening_id | BIGINT | 否 | 主键/标识 |
| warehouse_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| quantity | INT | 否 | 数量（件） |

```sql
CREATE TABLE inventory_opening (
  opening_id BIGINT PRIMARY KEY,
  warehouse_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL CHECK(quantity>=0),
  UNIQUE(warehouse_id,product_id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## inventory_snapshots

月末库存及标准成本，54000 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| snapshot_id | BIGINT | 否 | 主键/标识 |
| warehouse_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| snapshot_date | DATE | 否 | 日期（YYYY-MM-DD） |
| quantity | INT | 否 | 数量（件） |
| unit_cost_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE inventory_snapshots (
  snapshot_id BIGINT PRIMARY KEY,
  warehouse_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  snapshot_date DATE NOT NULL,
  quantity INT NOT NULL CHECK(quantity>=0),
  unit_cost_cents BIGINT NOT NULL CHECK(unit_cost_cents>=0),
  UNIQUE(warehouse_id,product_id,snapshot_date),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## promotion_stores

限定促销适用门店，一行一个活动门店组合，64 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| promotion_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| store_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |

```sql
CREATE TABLE promotion_stores (
  promotion_id BIGINT NOT NULL,
  store_id BIGINT NOT NULL,
  PRIMARY KEY(promotion_id,store_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(promotion_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## promotion_categories

限定促销适用品类，一行一个活动品类组合，84 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| promotion_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| category_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |

```sql
CREATE TABLE promotion_categories (
  promotion_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  PRIMARY KEY(promotion_id,category_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(promotion_id),
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## stock_transfers

仓间调拨单，发出与收货按运输期间分日入账，未到货为在途，2069 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| transfer_id | BIGINT | 否 | 调拨来源编号 |
| product_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| from_warehouse_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| to_warehouse_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| transfer_date | DATE | 否 | 业务来源字段，约束见建表语句 |
| expected_receipt_date | DATE | 否 | 调拨预计到货日 |
| received_date | DATE | 是 | 调拨实际到货日，截止日前未到为NULL |
| unit_cost_cents | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| quantity | INT | 否 | 业务来源字段，约束见建表语句 |

```sql
CREATE TABLE stock_transfers (
  transfer_id BIGINT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  from_warehouse_id BIGINT NOT NULL,
  to_warehouse_id BIGINT NOT NULL,
  transfer_date DATE NOT NULL,
  expected_receipt_date DATE NOT NULL,
  received_date DATE,
  unit_cost_cents BIGINT NOT NULL,
  quantity INT NOT NULL CHECK(quantity>0),
  CHECK(from_warehouse_id<>to_warehouse_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(warehouse_id),
  FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## stock_adjustments

盘点损耗单，只作用于现有可售库存，357 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| adjustment_id | BIGINT | 否 | 盘点损耗来源编号 |
| warehouse_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| product_id | BIGINT | 否 | 业务来源字段，约束见建表语句 |
| adjustment_date | DATE | 否 | 业务来源字段，约束见建表语句 |
| quantity_lost | INT | 否 | 盘点确认损耗件数 |
| reason | VARCHAR(160) | 否 | 业务来源字段，约束见建表语句 |

```sql
CREATE TABLE stock_adjustments (
  adjustment_id BIGINT PRIMARY KEY,
  warehouse_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  adjustment_date DATE NOT NULL,
  quantity_lost INT NOT NULL CHECK(quantity_lost>0),
  reason VARCHAR(160) NOT NULL,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## stock_movements

可售库存入出流水，85098 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| movement_id | BIGINT | 否 | 主键/标识 |
| warehouse_id | BIGINT | 否 | 主键/标识 |
| product_id | BIGINT | 否 | 主键/标识 |
| movement_date | DATE | 否 | 日期（YYYY-MM-DD） |
| movement_type | VARCHAR(160) | 否 | receipt 收货 / return 退货 / sale 销售 |
| quantity_delta | INT | 否 | 库存变化数量（入库正、出库负） |
| unit_cost_cents | BIGINT | 否 | 金额（马币分） |
| order_item_id | BIGINT | 是 | 主键/标识 |
| receipt_id | BIGINT | 是 | 主键/标识 |
| return_id | BIGINT | 是 | 退货来源编号 |
| transfer_id | BIGINT | 是 | 调拨来源编号 |
| adjustment_id | BIGINT | 是 | 盘点损耗来源编号 |

```sql
CREATE TABLE stock_movements (
  movement_id BIGINT PRIMARY KEY,
  warehouse_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  movement_date DATE NOT NULL,
  movement_type VARCHAR(160) NOT NULL,
  quantity_delta INT NOT NULL,
  unit_cost_cents BIGINT NOT NULL CHECK(unit_cost_cents>=0),
  order_item_id BIGINT,
  receipt_id BIGINT,
  return_id BIGINT,
  transfer_id BIGINT,
  adjustment_id BIGINT,
  CHECK((movement_type IN ('receipt','return','transfer_in') AND quantity_delta>0) OR (movement_type IN ('sale','transfer_out','loss') AND quantity_delta<0)),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id),
  FOREIGN KEY (receipt_id) REFERENCES goods_receipts(receipt_id),
  FOREIGN KEY (return_id) REFERENCES returns(return_id),
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(transfer_id),
  FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(adjustment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## v_po_lines

```sql
CREATE VIEW v_po_lines AS SELECT i.po_item_id,i.po_id,p.supplier_id,p.warehouse_id,p.order_date,p.promised_date,i.product_id,i.quantity_ordered,i.unit_price_cents,i.quantity_ordered*i.unit_price_cents AS ordered_cents,COALESCE(r.received,0) received,COALESCE(r.accepted,0) accepted,COALESCE(r.on_time,0) on_time,COALESCE(b.billed,0) billed,COALESCE(b.billed_cents,0) billed_cents FROM purchase_order_items i JOIN purchase_orders p ON p.po_id=i.po_id LEFT JOIN (SELECT g.po_item_id,SUM(g.quantity_received) received,SUM(g.quantity_received-g.quantity_rejected) accepted,SUM(CASE WHEN g.receipt_date<=p.promised_date THEN g.quantity_received-g.quantity_rejected ELSE 0 END) on_time FROM goods_receipts g JOIN purchase_order_items i ON i.po_item_id=g.po_item_id JOIN purchase_orders p ON p.po_id=i.po_id WHERE g.receipt_date<='2025-12-31' GROUP BY g.po_item_id) r ON r.po_item_id=i.po_item_id LEFT JOIN (SELECT po_item_id,SUM(quantity_billed) billed,SUM(quantity_billed*unit_price_cents) billed_cents FROM supplier_invoice_items GROUP BY po_item_id) b ON b.po_item_id=i.po_item_id WHERE p.status<>'cancelled' AND p.order_date<='2025-12-31';
```
