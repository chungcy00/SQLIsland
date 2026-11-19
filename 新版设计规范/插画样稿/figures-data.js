// 由 build_data.py 自动生成：真实课程/闪卡/业务任务字段与 SQLite 核对结果。请勿手改。
window.FIGDATA = {
 "checks": {
  "distinct": true,
  "coalesce": true,
  "lessonLeftGroup": true,
  "lessonLeftDetail": true,
  "fc0007": true
 },
 "tables": {
  "orders": {
   "name": "orders",
   "columns": [
    "id",
    "category",
    "sales",
    "store_id",
    "order_date",
    "customer_id"
   ],
   "rows": [
    [
     1,
     "护肤品",
     800,
     1,
     "2026-01-03",
     1
    ],
    [
     2,
     "化妆品",
     400,
     2,
     "2026-01-10",
     2
    ],
    [
     3,
     "护肤品",
     600,
     1,
     "2026-02-02",
     1
    ],
    [
     4,
     "化妆品",
     300,
     2,
     "2026-02-15",
     null
    ],
    [
     5,
     "日用品",
     1500,
     1,
     "2026-02-20",
     3
    ]
   ]
  },
  "customers": {
   "name": "customers",
   "columns": [
    "customer_id",
    "customer_name"
   ],
   "rows": [
    [
     1,
     "林"
    ],
    [
     2,
     "陈"
    ],
    [
     3,
     "王"
    ],
    [
     4,
     "李"
    ]
   ]
  },
  "nullable_values": {
   "name": "nullable_values",
   "columns": [
    "id",
    "value",
    "note"
   ],
   "rows": [
    [
     1,
     null,
     null
    ],
    [
     2,
     0,
     ""
    ],
    [
     3,
     10,
     "ok"
    ],
    [
     4,
     10,
     "ok"
    ]
   ]
  },
  "items": {
   "name": "items",
   "columns": [
    "id",
    "name",
    "category",
    "price",
    "stock"
   ],
   "rows": [
    [
     1,
     "Tea",
     "A",
     12,
     0
    ],
    [
     2,
     "Rice",
     "A",
     20,
     8
    ],
    [
     3,
     "Soap",
     "B",
     12,
     3
    ],
    [
     4,
     "Milk",
     "B",
     null,
     0
    ],
    [
     5,
     "Bag",
     "C",
     30,
     null
    ],
    [
     6,
     "Tea_2",
     "A",
     20,
     6
    ]
   ]
  }
 },
 "distinct": {
  "id": "kp02-02",
  "title": "DISTINCT 去重",
  "syntax": "SELECT DISTINCT column1, column2 FROM table_name;",
  "params": {
   "DISTINCT": "移除完全相同的输出行",
   "column1, column2": "共同决定去重粒度"
  },
  "conceptTable": {
   "type": "table",
   "columns": [
    "输出列",
    "一行代表",
    "本例结果行数"
   ],
   "rows": [
    [
     "category",
     "一种类别",
     "3"
    ],
    [
     "store_id, category",
     "一个门店类别组合",
     "3"
    ],
    [
     "id, category",
     "一笔订单的编号与类别",
     "5"
    ]
   ]
  },
  "sql": "SELECT DISTINCT store_id, category FROM orders ORDER BY store_id, category;",
  "expected": {
   "columns": [
    "store_id",
    "category"
   ],
   "rows": [
    [
     1,
     "护肤品"
    ],
    [
     1,
     "日用品"
    ],
    [
     2,
     "化妆品"
    ]
   ],
   "status": "SQLite实际执行",
   "orderGuaranteed": false
  },
  "usedHint": "原表 5 行，每行一笔订单。1、3 同属门店 1 的护肤品，2、4 同属门店 2 的化妆品，属于重复的门店类别组合。"
 },
 "func": {
  "id": "kp05-02",
  "title": "空值替换与候选值选择",
  "syntax": "IFNULL(a, b);\nCOALESCE(a, b, c);",
  "params": {
   "a": "优先使用的原始值",
   "b, c": "依业务优先级排列的备用值"
  },
  "sql": "SELECT id, IFNULL(value, -1) AS filled, COALESCE(note, 'missing') AS note_filled FROM nullable_values ORDER BY id;",
  "expected": {
   "columns": [
    "id",
    "filled",
    "note_filled"
   ],
   "rows": [
    [
     1,
     -1,
     "missing"
    ],
    [
     2,
     0,
     ""
    ],
    [
     3,
     10,
     "ok"
    ],
    [
     4,
     10,
     "ok"
    ]
   ],
   "status": "SQLite实际执行",
   "orderGuaranteed": false
  },
  "conceptTable": {
   "type": "table",
   "columns": [
    "输入",
    "处理表达式",
    "返回结果"
   ],
   "rows": [
    [
     "NULL",
     "IFNULL(value, -1)",
     "-1"
    ],
    [
     "0",
     "IFNULL(value, -1)",
     "0"
    ],
    [
     "NULL",
     "COALESCE(note, 'missing')",
     "missing"
    ],
    [
     "空字符串",
     "COALESCE(note, 'missing')",
     "空字符串"
    ]
   ]
  },
  "aggSql": "SELECT COUNT(*) AS rows_n, COUNT(price) AS priced_n FROM items",
  "aggQuestion": "同一数据表中，记录总数与已知价格数分别是多少？",
  "aggAnswer": {
   "answer": "返回以下结果。",
   "explanation": "六行商品中有一行价格未填写。计数对象不同会改变统计口径。",
   "code": "SELECT COUNT(*) AS rows_n, COUNT(price) AS priced_n FROM items",
   "sqliteCode": "SELECT COUNT(*) AS rows_n, COUNT(price) AS priced_n FROM items",
   "result": {
    "kind": "result",
    "columns": [
     "rows_n",
     "priced_n"
    ],
    "rows": [
     [
      6,
      5
     ]
    ]
   }
  },
  "agg": {
   "countAll": 6,
   "countPrice": 5
  }
 },
 "join": {
  "id": "kp01-03",
  "title": "主键、外键和一对多",
  "sql": "SELECT c.customer_id, COUNT(o.id) AS order_count FROM customers c LEFT JOIN orders o ON c.customer_id=o.customer_id GROUP BY c.customer_id ORDER BY c.customer_id;",
  "breakdown": [
   {
    "kind": "fragment",
    "title": "保留全部登记客户",
    "sql": "FROM customers c LEFT JOIN orders o ON c.customer_id=o.customer_id",
    "purpose": "按客户编号匹配，左侧客户始终保留。",
    "reason": "客户没有订单时仍需要出现在报表中。"
   },
   {
    "kind": "fragment",
    "title": "只计匹配的订单",
    "sql": "SELECT c.customer_id, COUNT(o.id) AS order_count",
    "purpose": "统计每个客户匹配到的非空订单编号。",
    "reason": "COUNT(*) 会把左连接补出的空订单行也算一笔。"
   },
   {
    "kind": "fragment",
    "title": "恢复客户粒度",
    "sql": "GROUP BY c.customer_id",
    "purpose": "把一个客户的多条匹配整理成一行。",
    "reason": "主管需要的是每客户订单数。"
   },
   {
    "kind": "fragment",
    "title": "稳定排列客户",
    "sql": "ORDER BY c.customer_id;",
    "purpose": "按客户编号排序。",
    "reason": "便于回查未下单及多次下单的客户。"
   }
  ],
  "expected": {
   "columns": [
    "customer_id",
    "order_count"
   ],
   "rows": [
    [
     1,
     2
    ],
    [
     2,
     1
    ],
    [
     3,
     1
    ],
    [
     4,
     0
    ]
   ],
   "status": "SQLite实际执行",
   "orderGuaranteed": false
  },
  "detail": {
   "label": "查看一对多匹配明细",
   "explanation": "观察客户1出现两次、客户4订单编号为空，再理解为什么最终需要分组。",
   "sql": "SELECT c.customer_id, o.id AS order_id FROM customers c LEFT JOIN orders o ON c.customer_id=o.customer_id ORDER BY c.customer_id,o.id;",
   "result": {
    "columns": [
     "customer_id",
     "order_id"
    ],
    "rows": [
     [
      1,
      1
     ],
     [
      1,
      3
     ],
     [
      2,
      2
     ],
     [
      3,
      5
     ],
     [
      4,
      null
     ]
    ]
   },
   "explanationBlocks": [
    {
     "type": "paragraph",
     "text": "观察客户1出现两次、客户4订单编号为空，再理解为什么最终需要分组。"
    }
   ]
  },
  "joins": {
   "INNER": {
    "sql": "select c.customer_id,c.customer_name,o.id from customers c inner join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
    "rows": [
     [
      1,
      "林",
      1
     ],
     [
      1,
      "林",
      3
     ],
     [
      2,
      "陈",
      2
     ],
     [
      3,
      "王",
      5
     ]
    ]
   },
   "LEFT": {
    "sql": "select c.customer_id,c.customer_name,o.id from customers c left join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
    "rows": [
     [
      1,
      "林",
      1
     ],
     [
      1,
      "林",
      3
     ],
     [
      2,
      "陈",
      2
     ],
     [
      3,
      "王",
      5
     ],
     [
      4,
      "李",
      null
     ]
    ]
   },
   "RIGHT": {
    "sql": "select c.customer_id,c.customer_name,o.id from customers c right join orders o on c.customer_id=o.customer_id order by o.id",
    "rows": [
     [
      1,
      "林",
      1
     ],
     [
      2,
      "陈",
      2
     ],
     [
      1,
      "林",
      3
     ],
     [
      null,
      null,
      4
     ],
     [
      3,
      "王",
      5
     ]
    ]
   },
   "FULL": {
    "sql": "select c.customer_id,c.customer_name,o.id from customers c full join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
    "rows": [
     [
      null,
      null,
      4
     ],
     [
      1,
      "林",
      1
     ],
     [
      1,
      "林",
      3
     ],
     [
      2,
      "陈",
      2
     ],
     [
      3,
      "王",
      5
     ],
     [
      4,
      "李",
      null
     ]
    ]
   }
  },
  "dataDescriptions": {
   "customers": "每行一名登记客户，以 customer_id 标识；共有 4 名。",
   "orders": "每行一笔订单，以 customer_id 对应客户。客户 1 匹配两笔，匿名订单的 customer_id 为空。"
  }
 },
 "metric": {
  "id": "BP11",
  "projectId": "ecommerce",
  "title": "新老客户净收入及客单价",
  "context": "营销部门比较首购客户与已有购买历史的客户。",
  "requirements": "仅线上有效订单。客户首次有效订单以日期、订单编号决胜；2025年按订单是否首购分组，输出客户数、订单数、净收入和平均订单净额（分）。",
  "grain": "订单所属客户阶段",
  "commonError": "先筛2025会把已有购买客户误标为新客；客户可在两个组出现。",
  "executionSteps": [
   "计算完整历史订单序号",
   "筛选目标年",
   "按首购标记汇总"
  ],
  "columns": [
   "segment",
   "customers",
   "orders",
   "net_cents",
   "avg_order_cents"
  ],
  "sql": "WITH a AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY customer_id ORDER BY order_date,order_id) rn FROM v_order_net WHERE channel='online') SELECT CASE WHEN rn=1 THEN 'new' ELSE 'returning' END segment,COUNT(DISTINCT customer_id) customers,COUNT(*) orders,SUM(net_cents) net_cents,ROUND(1.0*SUM(net_cents)/COUNT(*),2) avg_order_cents FROM a WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31' GROUP BY CASE WHEN rn=1 THEN 'new' ELSE 'returning' END ORDER BY segment"
 },
 "card": {
  "id": "fc0005",
  "type": "用法辨析",
  "front": {
   "question": "有一行订单但客户编号为 NULL，与根本没有这笔订单，统计时有什么区别？"
  },
  "back": {
   "answer": "前者是已存在且客户未知的记录；后者是不存在的记录。",
   "explanation": "前者会计入 COUNT(*)，但不会计入 COUNT(customer_id)。无法凭一个 NULL 断定记录不存在。"
  },
  "tags": [
   "NULL 与缺失记录",
   "用法辨析"
  ]
 }
};
