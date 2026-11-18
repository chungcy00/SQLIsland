# ecommerce 数据字典

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

## marketing_campaigns

渠道月广告支出，180 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| campaign_id | BIGINT | 否 | 主键/标识 |
| source_id | BIGINT | 否 | 主键/标识 |
| month_key | CHAR(7) | 否 | 统计月份 YYYY-MM |
| spend_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE marketing_campaigns (
  campaign_id BIGINT PRIMARY KEY,
  source_id BIGINT NOT NULL,
  month_key CHAR(7) NOT NULL,
  spend_cents BIGINT NOT NULL CHECK(spend_cents>=0),
  UNIQUE(source_id,month_key),
  FOREIGN KEY (source_id) REFERENCES traffic_sources(source_id)
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

## payments

订单支付，28816 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| payment_id | BIGINT | 否 | 主键/标识 |
| order_id | BIGINT | 否 | 主键/标识 |
| payment_date | DATE | 否 | 日期（YYYY-MM-DD） |
| amount_cents | BIGINT | 否 | 金额（马币分） |
| status | VARCHAR(160) | 否 | 业务状态（见表约束及口径） |

```sql
CREATE TABLE payments (
  payment_id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),
  status VARCHAR(160) NOT NULL CHECK(status IN ('settled','failed')),
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## raw_order_import

原始导入脏数据隔离区，400 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| raw_id | BIGINT | 否 | 主键/标识 |
| source_ref | VARCHAR(160) | 是 | 原始导入参考号 |
| raw_date | VARCHAR(160) | 是 | 未经清洗日期 |
| raw_customer | VARCHAR(160) | 是 | 未经清洗客户文本 |
| raw_amount | VARCHAR(160) | 是 | 未经清洗金额文本 |

```sql
CREATE TABLE raw_order_import (
  raw_id BIGINT PRIMARY KEY,
  source_ref VARCHAR(160),
  raw_date VARCHAR(160),
  raw_customer VARCHAR(160),
  raw_amount VARCHAR(160)
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

## v_sales_lines

```sql
CREATE VIEW v_sales_lines AS SELECT i.order_item_id,o.order_id,o.store_id,o.customer_id,o.session_id,o.channel,o.order_date,i.product_id,i.promotion_id,i.quantity-COALESCE(r.qty,0) AS net_qty,i.quantity*i.unit_price_cents-i.discount_cents-COALESCE(r.refund,0) AS net_cents,(i.quantity-COALESCE(r.qty,0))*i.unit_cost_cents AS cost_cents,i.discount_cents,COALESCE(r.refund,0) AS refund_cents FROM orders o JOIN order_items i ON o.order_id=i.order_id LEFT JOIN (SELECT order_item_id,SUM(quantity) qty,SUM(refund_cents) refund FROM returns WHERE return_date<='2025-12-31' GROUP BY order_item_id) r ON r.order_item_id=i.order_item_id WHERE o.status='completed';
```

## v_order_net

```sql
CREATE VIEW v_order_net AS SELECT order_id,store_id,customer_id,session_id,channel,order_date,SUM(net_cents) net_cents,SUM(cost_cents) cost_cents FROM v_sales_lines GROUP BY order_id,store_id,customer_id,session_id,channel,order_date;
```
