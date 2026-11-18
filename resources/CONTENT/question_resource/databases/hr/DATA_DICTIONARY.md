# hr 数据字典

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

## departments

部门主档，7 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| department_id | BIGINT | 否 | 主键/标识 |
| department_name | VARCHAR(160) | 否 | 名称 |

```sql
CREATE TABLE departments (
  department_id BIGINT PRIMARY KEY,
  department_name VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## positions

职位职级，5 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| position_id | BIGINT | 否 | 主键/标识 |
| position_name | VARCHAR(160) | 否 | 名称 |
| grade | INT | 否 | 职级 |

```sql
CREATE TABLE positions (
  position_id BIGINT PRIMARY KEY,
  position_name VARCHAR(160) NOT NULL,
  grade INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## employees

虚构员工，250 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| employee_id | BIGINT | 否 | 主键/标识 |
| employee_name | VARCHAR(160) | 否 | 名称 |
| hire_date | DATE | 否 | 日期（YYYY-MM-DD） |
| termination_date | DATE | 是 | 日期（YYYY-MM-DD） |

```sql
CREATE TABLE employees (
  employee_id BIGINT PRIMARY KEY,
  employee_name VARCHAR(160) NOT NULL,
  hire_date DATE NOT NULL,
  termination_date DATE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## employment_history

历史岗位和门店，324 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| employment_id | BIGINT | 否 | 主键/标识 |
| employee_id | BIGINT | 否 | 主键/标识 |
| department_id | BIGINT | 否 | 主键/标识 |
| position_id | BIGINT | 否 | 主键/标识 |
| store_id | BIGINT | 是 | 主键/标识 |
| start_date | DATE | 否 | 日期（YYYY-MM-DD） |
| end_date | DATE | 是 | 日期（YYYY-MM-DD） |

```sql
CREATE TABLE employment_history (
  employment_id BIGINT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  department_id BIGINT NOT NULL,
  position_id BIGINT NOT NULL,
  store_id BIGINT,
  start_date DATE NOT NULL,
  end_date DATE,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  FOREIGN KEY (position_id) REFERENCES positions(position_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## salary_history

员工月薪，3892 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| salary_id | BIGINT | 否 | 主键/标识 |
| employee_id | BIGINT | 否 | 主键/标识 |
| employment_id | BIGINT | 否 | 主键/标识 |
| month_key | CHAR(7) | 否 | 统计月份 YYYY-MM |
| base_cents | BIGINT | 否 | 金额（马币分） |
| bonus_cents | BIGINT | 否 | 金额（马币分） |

```sql
CREATE TABLE salary_history (
  salary_id BIGINT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  employment_id BIGINT NOT NULL,
  month_key CHAR(7) NOT NULL,
  base_cents BIGINT NOT NULL CHECK(base_cents>=0),
  bonus_cents BIGINT NOT NULL CHECK(bonus_cents>=0),
  UNIQUE(employee_id,month_key),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (employment_id) REFERENCES employment_history(employment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## attendance

出勤及加班，90639 行。

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| attendance_id | BIGINT | 否 | 主键/标识 |
| employee_id | BIGINT | 否 | 主键/标识 |
| attendance_date | DATE | 否 | 日期（YYYY-MM-DD） |
| status | VARCHAR(160) | 否 | 业务状态（见表约束及口径） |
| work_minutes | INT | 否 | 正常出勤分钟 |
| overtime_minutes | INT | 否 | 加班分钟 |

```sql
CREATE TABLE attendance (
  attendance_id BIGINT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(160) NOT NULL,
  work_minutes INT NOT NULL CHECK(work_minutes>=0),
  overtime_minutes INT NOT NULL CHECK(overtime_minutes>=0),
  UNIQUE(employee_id,attendance_date),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
```

## v_staff_month

```sql
CREATE VIEW v_staff_month AS SELECT s.employee_id,s.month_key,h.department_id,h.position_id,h.store_id,s.base_cents,s.bonus_cents,COALESCE(a.ot,0) overtime_minutes,COALESCE(a.worked,0) worked_minutes,s.base_cents+s.bonus_cents+ROUND(s.base_cents*1.5*COALESCE(a.ot,0)/10560.0,0) AS labor_cents FROM salary_history s JOIN employment_history h ON h.employment_id=s.employment_id LEFT JOIN (SELECT employee_id,SUBSTR(attendance_date,1,7) m,SUM(overtime_minutes) ot,SUM(work_minutes) worked FROM attendance GROUP BY employee_id,SUBSTR(attendance_date,1,7)) a ON a.employee_id=s.employee_id AND a.m=s.month_key;
```
