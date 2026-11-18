-- 教学样本。用于空白测试库。

CREATE TABLE `stores` (`store_id` BIGINT, `store_name` VARCHAR(200), `city` VARCHAR(200), `fulfillment_warehouse_id` BIGINT);

INSERT INTO `stores` VALUES
(1, '门店1', '古晋', 1),
(2, '门店2', '古晋', 1),
(3, '门店3', '古晋', 1);

CREATE TABLE `customers` (`customer_id` BIGINT, `customer_name` VARCHAR(200), `signup_date` VARCHAR(200), `region` VARCHAR(200), `member_since_date` VARCHAR(200));

INSERT INTO `customers` VALUES
(1, '客户1', '2024-01-01', NULL, NULL),
(2, '客户2', '2024-01-01', NULL, NULL),
(3, '客户3', '2024-01-01', NULL, NULL),
(4, '客户4', '2024-01-01', NULL, NULL);

CREATE TABLE `calendar_days` (`day` VARCHAR(200), `month_key` VARCHAR(200), `day_index` BIGINT);

INSERT INTO `calendar_days` VALUES
('2025-01-01', '2025-01', 1),
('2025-02-01', '2025-02', 2),
('2025-03-01', '2025-03', 3),
('2025-04-01', '2025-04', 4),
('2025-05-01', '2025-05', 5),
('2025-06-01', '2025-06', 6),
('2025-07-01', '2025-07', 7),
('2025-08-01', '2025-08', 8),
('2025-09-01', '2025-09', 9),
('2025-10-01', '2025-10', 10),
('2025-11-01', '2025-11', 11),
('2025-12-01', '2025-12', 12);

CREATE TABLE `orders` (`order_id` BIGINT, `store_id` BIGINT, `customer_id` BIGINT, `session_id` BIGINT, `order_date` VARCHAR(200), `channel` VARCHAR(200), `status` VARCHAR(200), `cancellation_reason` VARCHAR(200));

INSERT INTO `orders` VALUES
(1, 1, NULL, NULL, '2025-01-02', 'store', 'completed', NULL),
(2, 1, NULL, NULL, '2025-03-02', 'store', 'completed', NULL),
(3, 2, NULL, NULL, '2025-03-03', 'store', 'completed', NULL),
(4, 1, NULL, NULL, '2024-12-31', 'store', 'completed', NULL),
(5, NULL, 1, 5, '2025-01-02', 'online', 'completed', NULL),
(6, NULL, 1, 6, '2025-03-02', 'online', 'completed', NULL),
(7, NULL, 2, 7, '2025-03-03', 'online', 'completed', NULL),
(8, NULL, 2, 8, '2025-04-03', 'online', 'completed', NULL),
(9, NULL, 3, 9, '2025-05-03', 'online', 'cancelled', '客户取消'),
(10, NULL, 4, 10, '2025-06-03', 'online', 'pending', NULL),
(11, NULL, 3, 11, '2026-01-01', 'online', 'completed', NULL);

CREATE TABLE `order_items` (`order_item_id` BIGINT, `order_id` BIGINT, `product_id` BIGINT, `promotion_id` BIGINT, `quantity` BIGINT, `unit_price_cents` BIGINT, `discount_cents` BIGINT, `unit_cost_cents` BIGINT);

INSERT INTO `order_items` VALUES
(1, 1, 1, NULL, 2, 100, 0, 10),
(2, 1, 2, NULL, 1, 100, 0, 10),
(3, 1, 3, NULL, 1, 100, 0, 10),
(4, 1, 4, NULL, 1, 100, 0, 10),
(5, 2, 5, NULL, 1, 50, 0, 10),
(6, 3, 1, NULL, 1, 80, 0, 10),
(7, 4, 1, NULL, 1, 900, 0, 10),
(8, 5, 1, NULL, 1, 70, 0, 10),
(9, 5, 2, NULL, 1, 30, 0, 10),
(10, 6, 2, NULL, 1, 60, 0, 10),
(11, 7, 1, NULL, 1, 40, 0, 10),
(12, 8, 2, NULL, 1, 20, 0, 10),
(13, 9, 1, NULL, 1, 200, 0, 10),
(14, 10, 1, NULL, 1, 200, 0, 10),
(15, 11, 1, NULL, 1, 200, 0, 10);

CREATE TABLE `returns` (`return_id` BIGINT, `order_item_id` BIGINT, `return_date` VARCHAR(200), `quantity` BIGINT, `refund_cents` BIGINT);

INSERT INTO `returns` VALUES
(1, 1, '2025-02-01', 1, 100),
(2, 12, '2025-04-05', 1, 20);

CREATE VIEW v_sales_lines AS SELECT i.order_item_id,o.order_id,o.store_id,o.customer_id,o.session_id,o.channel,o.order_date,i.product_id,i.promotion_id,i.quantity-COALESCE(r.qty,0) AS net_qty,i.quantity*i.unit_price_cents-i.discount_cents-COALESCE(r.refund,0) AS net_cents,(i.quantity-COALESCE(r.qty,0))*i.unit_cost_cents AS cost_cents,i.discount_cents,COALESCE(r.refund,0) AS refund_cents FROM orders o JOIN order_items i ON o.order_id=i.order_id LEFT JOIN (SELECT order_item_id,SUM(quantity) qty,SUM(refund_cents) refund FROM returns WHERE return_date<='2025-12-31' GROUP BY order_item_id) r ON r.order_item_id=i.order_item_id WHERE o.status='completed';
CREATE VIEW v_order_net AS SELECT order_id,store_id,customer_id,session_id,channel,order_date,SUM(net_cents) net_cents,SUM(cost_cents) cost_cents FROM v_sales_lines GROUP BY order_id,store_id,customer_id,session_id,channel,order_date;

WITH totals AS (
 SELECT s.store_id, COALESCE(SUM(o.net_cents),0) net_cents
 FROM stores s LEFT JOIN v_order_net o ON o.store_id=s.store_id
  AND o.channel='store' AND o.order_date BETWEEN '2025-01-01' AND '2025-12-31'
 GROUP BY s.store_id
)
SELECT store_id,net_cents,ROUND(100.0*net_cents/NULLIF(SUM(net_cents) OVER(),0),2) sales_pct
FROM totals ORDER BY net_cents DESC,store_id;
