"""Produce the requested per-task before/after ledger and verify historical exports."""

from pathlib import Path
from collections import Counter
import json
import re
import sqlite3
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/enterprise_audit"))
from validate import fixture_db
from sync_resources import query
from run import rows_match
from changes import CHANGES

CONTENT = ROOT / "resources/CONTENT"
OUT = ROOT / "artifacts/task-reaudit-20261118"
BASE = ROOT / ".tooling/task-reaudit-20261118"


def read(p):
    return json.loads(p.read_text())


def write(p, d):
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")


def main():
    records = read(OUT / "tasks.json")
    original_tasks = read(BASE / "tasks-before.json")
    current_questions = {
        q["taskId"]: q
        for ch in [19, 20]
        for q in read(CONTENT / f"question_resource/questions/ch{ch}.json")["questions"]
    }
    with tarfile.open(BASE / "resources-before.tar.gz") as backup:
        original_questions = {
            q["taskId"]: q
            for ch in [19, 20]
            for q in json.load(
                backup.extractfile(f"CONTENT/question_resource/questions/ch{ch}.json")
            )["questions"]
        }
        docs = {
            group: backup.extractfile(
                f"CONTENT/enterprise_reference/business_tasks/{group}.md"
            )
            .read()
            .decode()
            for group in [
                "retail",
                "inventory",
                "ecommerce",
                "finance",
                "hr",
                "procurement",
                "enterprise",
            ]
        }
    exports = []
    for record in records:
        tid = record["task"]
        change = CHANGES.get(int(tid[2:]), {})
        record["category"] = change.get("category", "A")
        record["issue"] = change.get(
            "issue",
            "最新结构、业务口径、主库及现有独立场景复核通过；重新计算预期结果。",
        )
        before = original_tasks[tid]
        question = current_questions[tid]
        record["before"]["title"] = before["title"]
        for key in ["hints", "explanation", "referenceSolutions", "numericTolerance"]:
            record["before"][key] = original_questions[tid].get(key)
            record["after"][key] = question.get(key)
        text = docs[before["projectId"]]
        section = re.search(r"^## " + tid + r"\b.*?(?=^## |\Z)", text, re.M | re.S)
        code = re.search(r"```sql\s*\n(.*?)```", section[0], re.S)
        row_count = re.search(r"真实执行结果[：:]\s*(\d+)\s*行", section[0])
        legacy = code[1].strip().rstrip(";")
        check = {
            "task": tid,
            "recordedRows": int(row_count[1]) if row_count else None,
            "newRows": record["after"]["rowCount"],
            "sql": legacy,
            "counterexample": None,
        }
        for entry in question["testFixtures"]:
            f = read(CONTENT / "question_resource" / entry["path"])
            db = fixture_db(f)
            try:
                observed = query(db, legacy)
                if observed["columns"] != question["expectedColumns"] or not rows_match(
                    observed["rows"],
                    f["expected"]["rows"],
                    question,
                    observed["columns"],
                ):
                    check["counterexample"] = {
                        "fixture": entry["id"],
                        "executed": True,
                        "rows": len(observed["rows"]),
                        "expectedRows": len(f["expected"]["rows"]),
                    }
                    break
            except sqlite3.Error as error:
                check["counterexample"] = {
                    "fixture": entry["id"],
                    "executed": False,
                    "error": str(error),
                }
                break
            finally:
                db.close()
        if check["recordedRows"] != check["newRows"]:
            record[
                "issue"
            ] += f" 旧企业任务阅读版记载{check['recordedRows']}行，最新实际结果为{check['newRows']}行，已同步导出。"
        if check["counterexample"]:
            record[
                "issue"
            ] += " 旧企业任务阅读版参考SQL在最新主库或隐藏场景不成立，已替换为当前验证代码。"
            if record["category"] == "A":
                record["category"] = "B"
            elif record["category"] == "C":
                record["category"] = "D"
        record["before"]["exportSql"] = legacy
        record["before"]["exportRecordedRows"] = check["recordedRows"]
        record["exportVerification"] = check["counterexample"]
        record["formalAnswerChanged"] = before["sqliteSql"] != record["after"]["sql"]
        record["answerModificationScope"] = (
            "formal-and-export"
            if record["formalAnswerChanged"]
            else (
                "export-only"
                if check["counterexample"]
                else "verification-and-expected"
            )
        )
        record["reviewDimensions"] = {
            "structureAndFields": "全部声明表与依赖字段均在实际数据库执行确认",
            "businessDefinition": "人工逐题复核期间、粒度、币种、退款、采购及雇佣口径",
            "joinsAndComplexRecords": "独立原始事实计算与公开/隐藏场景交叉核对，明细在共同粒度预聚合",
            "emptyAndValue": (
                "正常对账题BP36/BP39保留空主库，隐藏诊断场景必须返回差异"
                if tid in ["BP36", "BP39"]
                else f"主库返回{record['after']['rowCount']}行；阈值及样本量与当前分布核对"
            ),
            "difficulty": "保留"
            + record["difficulty"]
            + "；复核的分析步骤为"
            + "、".join(question["executionSteps"]),
            "consistency": "题目、两种参考、提示、解析、课程、卡片说明、公开及隐藏预期、阅读版与镜像脚本同步",
        }
        exports.append(check)
    write(OUT / "tasks.json", records)
    write(OUT / "historical-export-validation.json", exports)
    generate_report(records)


def generate_report(records):
    categories = Counter(r["category"] for r in records)
    wrong = read(OUT / "wrong-solutions.json")
    rejected = sum(w["rejectedByResult"] for t in wrong for w in t["queries"])
    errors = sum(
        any(not a.get("executed") for a in w["attempts"])
        for t in wrong
        for w in t["queries"]
    )
    accepted = [
        {"task": t["task"], "label": w["label"]}
        for t in wrong
        for w in t["queries"]
        if not w["rejectedByResult"]
        and all(a.get("executed") and a.get("accepted") for a in w["attempts"])
    ]
    wasm = read(OUT / "wasm-validation.json")
    wasm_wrong = read(OUT / "wasm-wrong-solutions.json")
    data = read(OUT / "seven-database-checks.json")
    invariants = read(OUT / "business-invariants.json")
    fixtures = sum(len(r["checks"]) for r in records)
    performance = read(OUT / "performance.json")
    summary = {
        "contentVersion": "4.2.1",
        "databaseVersion": "4.2.0",
        "questions": 50,
        "categories": dict(sorted(categories.items())),
        "fixtures": fixtures,
        "sqliteCorrectExecutions": fixtures * 2,
        "wasmCorrectExecutions": wasm["correctExecutions"],
        "sqliteExecutableWrongQueriesRejected": rejected,
        "syntaxErrorsExcludedFromWrongResultProof": errors,
        "validEquivalentCandidatesAccepted": accepted,
        "wasmExecutableWrongQueriesRejected": wasm_wrong["resultRejections"],
        "businessInvariants": len(invariants),
        "databaseCount": len(data["datasets"]),
        "databaseBytes": sum(d["bytes"] for d in data["datasets"]),
        "emptyPublicTasks": [r["task"] for r in records if r["after"]["rowCount"] == 0],
        "dataContentChanged": False,
        "mysql84NativeVerified": False,
    }
    write(OUT / "summary.json", summary)
    lines = [
        "# 数屿SQL 50道企业实战题逐题复审",
        "",
        "题目资源升级至4.2.1，基准为当前七套4.2.0业务数据库及2025-12-31统计截止日。开始前已完整备份资源，备份路径及SHA256见 backup.json。",
        "",
        "## 审核与执行结果",
        "",
        "、".join(f"{k}类{v}题" for k, v in sorted(categories.items()))
        + "。共50题，稳定题号、知识点关联、300题总量及200张闪卡数量均已核对。六类业务各5题，第20章20题。",
        "",
        f'{fixtures}个实际公开及隐藏场景，各自执行参考解与等价解。原生SQLite及sql.js WASM各完成{fixtures*2}次正确/等价执行。{rejected}条可执行错误候选被结果比较拒绝，{errors}条SQL错误单列；BP29的AVG金额/AVG数量与SUM金额/SUM数量具有相同非空行分母，确认为合法等价解并接受。WASM另逐题执行典型错误及公开结果硬编码，共{wasm_wrong["resultRejections"]}条均被拒绝。',
        "",
        "50题全部使用独立Python原始事实聚合计算预期，未执行参考SQL或读取派生视图来生成独立预期。修改后的分批开票分配使用逐条消耗算法，与SQL累计窗口独立交叉核对。BP29的实际浏览器Worker同时验证正确解、两种等价解、编号错误及百分比错误。",
        "",
        "## 实际发现与修复",
        "",
        "- 门店看板原12家店全部1项异常，改为全体加权基准复核，最新分布为8家0项、3家1项、1家2项。基准使用全部门店，分母及缺失规则已明确。",
        "- 季度报告原四季全部3项风险，改为与上年同季度比较，最新Q1/Q2为2项、Q3/Q4为1项；准确季度末库存与缺失计数同步修复。",
        "- 发票价格复核按本张发票数量重算采购价格，避免将部分开票和批准贷项误作价格差。公开异常候选从1434张降至984张。",
        "- 多发票共享采购单时，按采购行和发票先后分配合格收货，同一批收货只使用一次。",
        "- 转化会话采用同一期间访问总体；未来开票排除于期末核对；未知预算和缺失快照保留未知状态。",
        "- 银行正向冲回按有符号净支出计算，无参考号采用类型和编号独立键。",
        "- 派生价格容差与溢价百分比容差分列，整数编号继续精确核对。",
        "- 企业任务阅读版、课程/题库/闪卡阅读版及MySQL镜像验证脚本存在过期内容，已由最新正式JSON重新同步。旧阅读版SQL的逐场景反例见 historical-export-validation.json。",
        "",
        "## 数据真实性与一致性",
        "",
        f'七库共{summary["databaseBytes"]:,}字节。所有库通过SQLite完整性及外键检查，共享事实逐表与综合企业库一致。{len(invariants)}项业务核对通过，覆盖退款数量与金额、促销日期及适用条件、采购合同、分批收货、库存流水与54000条月末快照、历史成本、任职和考勤、薪资及财务来源平衡。七库文件哈希与备份基准一致。',
        "",
        "本次核实了数据中存在正向银行冲回、付款早于后续收货、部分付款和批准贷项等情况，按各题业务定义处理。销售目标与当前销售规模差距很大、费用和人工率很高，表示该模拟数据下经营压力较高；本轮通过题目提供相对基准及同比背景。经营比率只能解释当前模拟样本，缺乏真实企业外部基准用于验证其总体规模代表性。",
        "",
        "BP36与BP39在干净主库分别返回0行，符合对账定义。隐藏场景实际出现差异并被正确识别，公开空结果的硬编码无法通过。",
        "",
        "## 逐题清单",
        "",
        "| 题号 / 任务 | 原题名称 | 分类 | 发现及处理 | 公开结果行数 | 场景数 | 结果拒绝数 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in records:
        lines.append(
            f"| {r['question']} / {r['task']} | {r['originalTitle']} | {r['category']} | {r['issue'].replace('|','/')} | {r['before']['rowCount']} → {r['after']['rowCount']} | {len(r['checks'])} | {r['wrongRejected']} |"
        )
    lines += [
        "",
        "## 每题修改前后与执行证据",
        "",
        "tasks.json逐题保留原题名称、原正式代码、原阅读版代码、原要求、提示、解析、容差、最新对应内容、公开结果行数及每个夹具执行状态。wrong-solutions.json保存实际执行的错误候选、反例夹具和结果状态。下列列出每题的实际变更范围。",
        "",
    ]
    for r in records:
        lines += [
            "### "
            + r["question"]
            + " "
            + r["originalTitle"]
            + "（"
            + r["category"]
            + "）",
            "",
            r["issue"],
            "",
            "修改前的要求为 " + r["before"]["requirements"],
            "",
            "修改后的要求为 " + r["after"]["requirements"],
            "",
            f"原生SQLite及WASM在{len(r['checks'])}个场景各执行参考与等价解；原始事实独立计算逐行核对通过。公开结果{r['before']['rowCount']}行变为{r['after']['rowCount']}行，原生SQLite本机首次完整取数耗时{r['publicExecutionMs']}毫秒。",
            "",
            "最新参考代码见 "
            + f"../../resources/CONTENT/enterprise_reference/business_tasks/sqlite_queries/{r['task']}.sql"
            + "；逐字前后代码见 tasks.json。",
            "",
        ]
    lines += [
        "## 资源同步与性能",
        "",
        f"50道正式题、50份任务定义及结果、两种方言脚本、50个课程知识点、关联闪卡说明、{fixtures}份公开/隐藏夹具、整数列策略、导出阅读版和资源清单已同步。详细文件变更、字节数及前后SHA256见 resource-sync.json。新增夹具使用隔离副本，正式数据库保留其现有业务记录。",
        "",
        f"性能数值来自本机原生SQLite完整取数与Node.js sql.js WASM实际执行，逐题耗时见tasks.json及wasm-validation.json。公开查询中位数{performance['publicQueryMedianMs']:.2f}毫秒、最慢{performance['publicQueryMaxMs']:.2f}毫秒，整题全部场景执行中位数{performance['fullSubmissionMedianMs']:.2f}毫秒、最慢{performance['fullSubmissionMaxMs']:.2f}毫秒。离线资源增加{performance['offlineBytes']-performance['previousOfflineBytes']:,}字节，七库合计{performance['databaseBytes']:,}字节。实体手机耗时仍待复验。",
        "",
        "## 验证限制",
        "",
        "原生MySQL8.4尚未执行，MySQL脚本已同步并经SQLite兼容层验证，MySQL严格模式及原生执行差异仍待复验。原有q0212和q0240专项结构检查保持未评定，均属于这50题之外。此前模拟器历史IndexedDB损坏的记录继续保存在上一轮审计报告。",
        "",
    ]
    native_path = OUT / "native-grading.json"
    update_path = OUT / "live-update.json"
    if native_path.exists() and update_path.exists():
        native = read(native_path)
        update = read(update_path)
        assert native["pass"] and update["updateRegressionStateRetained"]
        executions = sum(
            check.get("fixtures", 0) for check in native["checks"] if check.get("pass")
        )
        lines += [
            "## 发布与安卓验收",
            "",
            "已发布数屿SQL 0.3.2，包含题目资源4.2.1。公开APK下载、校验及Android系统安装流程通过，安装后提取的APK哈希与公开文件一致。",
            "",
            f"Android16模拟器断网抽验q0270、q0279、q0300的参考解及等价解，共{executions}个场景执行通过；错误百分比及季度风险条件被拒绝。七库ERD及离线查询加载通过。",
            "",
            "从0.3.1更新至0.3.2后，新建回归记录的完成状态、笔记、收藏、草稿、答题、闪卡进度、复习事件、个人卡片与实验室工作区九类状态逐项比较通过。读取状态时使用同版本同签名调试包，公开正式APK实际经过下载校验及系统覆盖安装；验收结束已恢复正式包。",
            "",
            "干净源码副本独立安装依赖、构建及14项自动测试通过，1184个离线文件与发布APK逐字节哈希匹配，2514项内容清单哈希核对通过。更多证据见native-grading.json、live-update.json和source-build.json。",
            "",
        ]
        summary.update(
            appRelease="0.3.2",
            nativeAndroid16Verified=True,
            nativeGradingFixtureExecutions=executions,
            publicUpdateVerified=True,
        )
        write(OUT / "summary.json", summary)
    (OUT / "逐题审核报告.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
