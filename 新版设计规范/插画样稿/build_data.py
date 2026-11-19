"""由真实课程/闪卡/业务任务资源生成 figures-data.js（只读源文件，不改动任何资源）。
同时用 SQLite 实际执行核对课程结果与连接结果。用法：python3 -I build_data.py"""
import json, os, sqlite3, hashlib
R = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../resources/CONTENT"))
J = lambda p: json.load(open(os.path.join(R, p), encoding="utf-8"))
def kp(ch, k):
    return next(x for x in J(f"courses_resource/courses/{ch}.json")["knowledgePoints"] if x["id"] == k)
def lesson(k):
    return J(f"courses_resource/structured/lessons/{k}.json")
def tbl(src, name):
    t = next(t for t in src if t["name"] == name)
    return {"name": name, "columns": [c["name"] for c in t["columns"]], "rows": t["rows"]}

def run(tables, sql):
    db = sqlite3.connect(":memory:")
    for t in tables:
        db.execute(f'create table {t["name"]} ({",".join(t["columns"])})')
        db.executemany(f'insert into {t["name"]} values ({",".join("?"*len(t["columns"]))})', t["rows"])
    cur = db.execute(sql)
    return [list(r) for r in cur.fetchall()]

k0203, k0502, k0103 = kp("ch02", "kp02-02"), kp("ch05", "kp05-02"), kp("ch01", "kp01-03")
orders = tbl(k0203["sourceTables"], "orders")
nullable = tbl(k0502["sourceTables"], "nullable_values")
ct = k0103["sourceTables"]
customers, orders13 = tbl(ct, "customers"), tbl(ct, "orders")
assert orders["rows"] == orders13["rows"]
fc7 = next(c for c in J("flashcard_resource/flashcards/ch01.json")["cards"] if c["id"] == "fc0007")
fc5 = next(c for c in J("flashcard_resource/flashcards/ch01.json")["cards"] if c["id"] == "fc0005")
items = tbl(fc7["front"]["sourceTables"], "items")
bp = J("enterprise_reference/business_tasks/BP11.json")
L0203, L0502, L0103 = lesson("kp02-02"), lesson("kp05-02"), lesson("kp01-03")

# SQLite 核对
check = {}
check["distinct"] = run([orders], L0203["completeCode"]["sqliteSql"]) == L0203["expectedResult"]["rows"]
check["coalesce"] = run([nullable], L0502["completeCode"]["sqliteSql"]) == L0502["expectedResult"]["rows"]
check["lessonLeftGroup"] = run([customers, orders13], L0103["completeCode"]["sqliteSql"]) == L0103["expectedResult"]["rows"]
ext = L0103["extensions"][0]
check["lessonLeftDetail"] = run([customers, orders13], ext["sql"]) == ext["result"]["rows"]
check["fc0007"] = True
joins = {}
for kind, sql in {
 "INNER": "select c.customer_id,c.customer_name,o.id from customers c inner join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
 "LEFT": "select c.customer_id,c.customer_name,o.id from customers c left join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
 "RIGHT": "select c.customer_id,c.customer_name,o.id from customers c right join orders o on c.customer_id=o.customer_id order by o.id",
 "FULL": "select c.customer_id,c.customer_name,o.id from customers c full join orders o on c.customer_id=o.customer_id order by c.customer_id,o.id",
}.items():
    joins[kind] = {"sql": sql, "rows": run([customers, orders13], sql)}
agg = {"countAll": run([items], "select count(*) from items")[0][0], "countPrice": run([items], "select count(price) from items")[0][0]}
check["fc0007"] = [agg["countAll"], agg["countPrice"]] == fc7["back"]["result"]["rows"][0]

data = {
 "checks": check,
 "tables": {"orders": orders, "customers": customers, "nullable_values": nullable, "items": items},
 "distinct": {"id": "kp02-02", "title": k0203["title"], "syntax": k0203["syntax"], "params": k0203["parameters"],
              "conceptTable": next(b for b in L0203["conceptBlocks"] if b["type"] == "table"),
              "sql": L0203["completeCode"]["sqliteSql"], "expected": L0203["expectedResult"],
              "usedHint": L0203["dataDescriptions"]["orders"]},
 "func": {"id": "kp05-02", "title": k0502["title"], "syntax": k0502["syntax"], "params": k0502["parameters"],
          "sql": L0502["completeCode"]["sqliteSql"], "expected": L0502["expectedResult"],
          "conceptTable": next(b for b in L0502["conceptBlocks"] if b["type"] == "table"),
          "aggSql": fc7["front"]["code"], "aggQuestion": fc7["front"]["question"], "aggAnswer": fc7["back"], "agg": agg},
 "join": {"id": "kp01-03", "title": k0103["title"], "sql": L0103["completeCode"]["sqliteSql"],
          "breakdown": L0103["breakdown"], "expected": L0103["expectedResult"], "detail": ext, "joins": joins,
          "dataDescriptions": L0103["dataDescriptions"]},
 "metric": {"id": bp["id"], "projectId": bp["projectId"], "title": bp["title"], "context": bp["context"],
            "requirements": bp["requirements"], "grain": bp["grain"], "commonError": bp["commonError"],
            "executionSteps": bp["executionSteps"], "columns": bp["columns"], "sql": bp["sqliteSql"]},
 "card": {"id": fc5["id"], "type": fc5["type"], "front": fc5["front"], "back": fc5["back"], "tags": fc5["tags"]},
}
out = "// 由 build_data.py 自动生成：真实课程/闪卡/业务任务字段与 SQLite 核对结果。请勿手改。\nwindow.FIGDATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
open(os.path.join(os.path.dirname(__file__), "figures-data.js"), "w", encoding="utf-8").write(out)
print("checks", check, "agg", agg, "sqlite", sqlite3.sqlite_version)
print("fc7 back", json.dumps(fc7["back"], ensure_ascii=False)[:300])
print({k: len(v["rows"]) for k, v in joins.items()})
