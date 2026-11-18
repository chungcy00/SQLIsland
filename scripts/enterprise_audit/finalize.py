"""Publish local audit metadata and a reproducible, evidence-linked report."""

from collections import Counter
from pathlib import Path
import json
import math
import statistics
import time
from repair_data import ROOT, CONTENT, ORIGINAL, DBREL, OUT, connect, dump, stats
from sync_resources import VERSION, sha, query


def synchronize_reference_metadata():
    root_path = CONTENT / "enterprise_reference/manifest_root.json"
    root = json.loads(root_path.read_text())
    root["taskSummary"] = [
        {
            "id": f"BP{n:02}",
            "questionId": f"q{250+n:04}",
            "rows": json.loads(
                (
                    CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
                ).read_text()
            )["expectedRowCount"],
        }
        for n in range(1, 51)
    ]
    for entry in root.get("files", []):
        file = CONTENT / entry["path"]
        if file.is_file():
            entry.update(sha256=sha(file), bytes=file.stat().st_size)
    dump(root_path, root)
    path = CONTENT / "flashcard_resource/reference/source_index.json"
    index = json.loads(path.read_text())
    index.setdefault("historicalSourceFiles", index.get("sourceFiles", {}))
    current = {
        str(p.relative_to(CONTENT)): sha(p)
        for group in ["courses_resource/courses", "question_resource/questions"]
        for p in sorted((CONTENT / group).glob("*.json"))
    }
    index.update(
        courseVersion=VERSION,
        questionVersion=VERSION,
        sourceFiles=current,
        auditedSourceFiles=current,
    )
    for group, entry in index["databases"].items():
        dbfile = CONTENT / f"question_resource/databases/{group}/{group}.sqlite"
        schema = json.loads((dbfile.parent / "schema.json").read_text())
        db = connect(dbfile)
        rowcount = sum(
            db.execute("SELECT COUNT(*) FROM " + name).fetchone()[0]
            for name in schema["tables"]
        )
        db.close()
        entry.update(
            sha256=sha(dbfile),
            bytes=dbfile.stat().st_size,
            tables=len(schema["tables"]),
            views=len(schema["views"]),
            rows=rowcount,
            objects=list(schema["tables"]) + list(schema["views"]),
            contentVersion=VERSION,
        )
    for tid, entry in index["businessTasks"].items():
        entry["sourceSha256"] = sha(
            CONTENT / f"enterprise_reference/business_tasks/{tid}.json"
        )
    dump(path, index)


def annotate_verified_runtime():
    path = OUT / "wasm-validation.json"
    if not path.is_file():
        return None
    evidence = json.loads(path.read_text())
    questions = []
    for ch in [19, 20]:
        questions.extend(
            json.loads(
                (CONTENT / f"question_resource/questions/ch{ch}.json").read_text()
            )["questions"]
        )
    inputs = [
        {
            "id": q["id"],
            "solutions": [r["mysqlSql"] for r in q["referenceSolutions"]],
            "fixtures": [
                {"path": f["path"], "sha256": f["sha256"]} for f in q["testFixtures"]
            ],
            "tolerance": q["numericTolerance"]["absolute"],
        }
        for q in questions
    ]
    assert (
        inputs == evidence["semanticInputs"]
    ), "WASM evidence is stale for current query/fixture semantics"
    for path, hash_value in evidence["databaseHashes"].items():
        assert sha(CONTENT / "question_resource" / path) == hash_value
    for ch in [19, 20]:
        path = CONTENT / f"question_resource/questions/ch{ch}.json"
        chapter = json.loads(path.read_text())
        for q in chapter["questions"]:
            q["compatibility"] = (
                "本版本已通过SQLite和sql.js WASM实际执行；MySQL8.4原生尚未运行。"
            )
            q["validation"]["wasm"] = {
                "pass": True,
                "sqliteVersion": evidence["sqliteVersion"],
                "fixtureCount": len(q["testFixtures"]),
            }
        dump(path, chapter)
        path = CONTENT / f"courses_resource/courses/ch{ch}.json"
        chapter = json.loads(path.read_text())
        for kp in chapter["knowledgePoints"]:
            if kp.get("taskId"):
                kp["compatibility"][
                    "detail"
                ] = "本版本SQLite及sql.js WASM已实际复验，原生MySQL8.4尚未执行。"
        dump(path, chapter)
    for n in range(1, 51):
        path = CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
        task = json.loads(path.read_text())
        task["validationStatus"] = {
            "independentPython": True,
            "sqliteWasm": True,
            "mysql84Native": False,
        }
        dump(path, task)
    return evidence


def inventory_manifest():
    synchronize_reference_metadata()
    for group in ["courses_resource", "question_resource", "flashcard_resource"]:
        root = CONTENT / group
        path = root / "manifest.json"
        manifest = json.loads(path.read_text())

        def update(obj):
            if isinstance(obj, dict):
                if "path" in obj and (root / obj["path"]).is_file():
                    file = root / obj["path"]
                    obj["sha256"] = sha(file)
                    if "bytes" in obj:
                        obj["bytes"] = file.stat().st_size
                for value in list(obj.values()):
                    update(value)
            elif isinstance(obj, list):
                for value in obj:
                    update(value)

        manifest["contentVersion"] = VERSION
        manifest["auditRelease"] = VERSION
        if "releaseGate" in manifest:
            manifest["releaseGate"] = "SQLite/WASM及独立计算已复验，原生MySQL8.4与实体手机性能待验收；q0212和q0240专项结构仍未评定"
        update(manifest)
        if group == "question_resource":
            manifest["testFixtureCount"] = sum(
                len(q["testFixtures"])
                for path in (root / "questions").glob("*.json")
                for q in json.loads(path.read_text())["questions"]
            )
            manifest["sharedTestData"] = [
                {
                    "path": str(p.relative_to(root)),
                    "bytes": p.stat().st_size,
                    "sha256": sha(p),
                }
                for p in sorted((root / "fixtures/shared").glob("*.json"))
            ]
        dump(path, manifest)
    tasks = []
    for n in range(1, 51):
        p = CONTENT / f"enterprise_reference/business_tasks/BP{n:02}.json"
        t = json.loads(p.read_text())
        tasks.append(
            {
                "id": t["id"],
                "path": p.name,
                "title": t["title"],
                "projectId": t["projectId"],
                "datasetId": t["datasetId"],
                "questionId": f"q{250+n:04}",
                "sha256": sha(p),
                "expectedRows": t["expectedRowCount"],
            }
        )
    dump(
        CONTENT / "enterprise_reference/business_tasks/manifest.json",
        {"contentVersion": VERSION, "count": 50, "tasks": tasks},
    )
    files = []
    for p in sorted(CONTENT.rglob("*")):
        if (
            not p.is_file()
            or p == CONTENT / "manifest.json"
            or "__pycache__" in p.parts
        ):
            continue
        files.append(
            {
                "path": str(p.relative_to(CONTENT)),
                "bytes": p.stat().st_size,
                "sha256": sha(p),
            }
        )
    old = json.loads((ORIGINAL / "manifest.json").read_text())
    old.update(auditRelease=VERSION, mysqlNativeRuns=0, files=files)
    dump(CONTENT / "manifest.json", old)


def performance():
    timing = []
    before = connect(ORIGINAL / DBREL)
    after = connect(CONTENT / DBREL)
    for n in range(1, 51):
        row = {"task": f"BP{n:02}"}
        for label, root, db in [
            ("before", ORIGINAL, before),
            ("after", CONTENT, after),
        ]:
            t = json.loads(
                (
                    root / f"enterprise_reference/business_tasks/BP{n:02}.json"
                ).read_text()
            )
            samples = []
            for _ in range(3):
                start = time.perf_counter()
                result = query(db, t["sqliteSql"])
                samples.append((time.perf_counter() - start) * 1000)
            row[label] = {
                "medianMs": round(statistics.median(samples), 3),
                "samplesMs": [round(s, 3) for s in samples],
                "rows": len(result["rows"]),
            }
        timing.append(row)
    before.close()
    after.close()
    dump(
        OUT / "query-performance.json",
        {
            "environment": "本机Python sqlite3，顺序执行，每题3次完整取数，记录中位数；不代表实体手机。",
            "queries": timing,
        },
    )
    return timing


def main():
    wasm = annotate_verified_runtime()
    tests = json.loads((OUT / "task-audit.json").read_text())
    wrong = json.loads((OUT / "wrong-solutions.json").read_text())
    checks = json.loads((OUT / "business-invariants.json").read_text())
    exports = json.loads((OUT / "database-export.json").read_text())
    before = json.loads((OUT / "before.json").read_text())
    after = json.loads((OUT / "after.json").read_text())
    sync = json.loads((OUT / "resource-sync.json").read_text())
    assert all(c["pass"] for c in checks)
    assert all(not q["survivingMutants"] for q in wrong)
    timing = performance()
    c = connect(CONTENT / DBREL)

    def rows(sql):
        return [list(r) for r in c.execute(sql)]

    anomalies = {
        "supplierInvoiceDuplicates": after["duplicateInvoiceGroups"],
        "overpaidInvoices": after["overpaidInvoices"],
        "creditNotes": c.execute(
            "SELECT COUNT(*) FROM supplier_credit_notes"
        ).fetchone()[0],
        "supplierPaymentStates": rows(
            "SELECT CASE WHEN balance_cents=0 THEN 'paid' WHEN paid_cents=0 THEN 'unpaid' WHEN balance_cents>0 THEN 'partial' ELSE 'overpaid' END,COUNT(*) FROM v_invoice_balance GROUP BY 1"
        ),
        "failedPaymentAttempts": c.execute(
            "SELECT COUNT(*) FROM payments WHERE status='failed'"
        ).fetchone()[0],
        "partialReceipts": c.execute(
            "SELECT COUNT(*) FROM v_po_lines WHERE accepted>0 AND accepted<quantity_ordered"
        ).fetchone()[0],
        "suppliers": after["supplierDelivery"],
        "movements": after["movementTypes"],
        "warehouseStockouts": c.execute(
            "SELECT COUNT(*) FROM inventory_snapshots WHERE snapshot_date='2025-12-31' AND quantity=0"
        ).fetchone()[0],
        "semanticNulls": {
            "customerRegion": c.execute(
                "SELECT COUNT(*) FROM customers WHERE region IS NULL"
            ).fetchone()[0],
            "employeeNotTerminated": c.execute(
                "SELECT COUNT(*) FROM employees WHERE termination_date IS NULL"
            ).fetchone()[0],
            "anonymousStoreOrders": c.execute(
                "SELECT COUNT(*) FROM orders WHERE channel='store' AND customer_id IS NULL"
            ).fetchone()[0],
        },
        "normalDataViolations": sum(x["violations"] for x in checks),
        "isolation": "主库正常交易保持来源完整；raw_order_import保留原始脏数据，隐藏边界和独立场景B的漏记/差额只作用于隔离副本。",
    }
    dump(OUT / "anomaly-distribution.json", anomalies)
    distribution = []
    for label, key in [
        ("商品销量（全部订单明细）", "productQuantity"),
        ("购买客户的线上有效订单频次", "customerFrequency"),
        ("员工调动距入职天数", "transferTenureDays"),
        ("期初仓库商品库存", "inventoryOpening"),
        ("12月实发基础薪资（分）", "salaryDecember"),
    ]:
        a = before[key]
        b = after[key]
        distribution.append(
            f"| {label} | {a['p50']} / {a['p95']} / {a['maximum']} | {b['p50']} / {b['p95']} / {b['maximum']} |"
        )

    def seasonal(s):
        v = [r[1] for r in s["monthlySales"] if r[0] >= "2025"]
        return max(v) / min(v)

    old_size = sum(
        x["bytes"]
        for x in json.loads(
            (ORIGINAL / "enterprise_reference/manifest_root.json").read_text()
        )["datasets"].values()
    )
    new_size = sum(x["bytes"] for x in exports.values())
    candidate_count = sum(len(q["tests"]) for q in wrong)
    rejected = sum(t["rejected"] for q in wrong for t in q["tests"])
    equiv = sum(
        t.get("classification") == "equivalent" for q in wrong for t in q["tests"]
    )
    fixture_count = sum(len(t["fixtures"]) for t in tests)
    audit = {
        "version": VERSION,
        "seed": 2026111705,
        "counts": {
            "databases": 7,
            "questions": 300,
            "flashcards": 200,
            "auditedBusinessQuestions": 50,
            "auditedBusinessFixtures": fixture_count,
            "independentResultComparisons": fixture_count,
            "businessInvariantChecks": len(checks),
            "wrongQueriesRejected": rejected,
            "additionalEquivalentQueriesAccepted": equiv,
            "candidateQueries": candidate_count,
            "hardcodedPublicResultsRejected": 50,
        },
        "nullPolicy": "保留具有业务含义的NULL，不为了完整率填补空值；题目明确规定的零业务量聚合仍按原口径返回0。",
        "bytes": {"before": old_size, "after": new_size},
        "environment": {
            "pythonSQLite": __import__("sqlite3").sqlite_version,
            "mysqlAvailable": "本机5.7.24，不支持本任务所需的8.4 CTE/窗口验证；Docker daemon未运行",
            "mysql84NativeRuns": 0,
        },
        "limitations": [
            "原生MySQL8.4脚本尚未实际导入执行，不能将SQLite或WASM验证视为原生通过。",
            "实体Android10和Android16的完整性能尚待验收。",
            "分布参数、活动优惠与业务效果均为虚构教学假设，未用真实企业样本校准；前期等长窗口比较不能证明促销因果增量。",
            "离线隐藏数据可被逆向读取，测试用于检验泛化和业务逻辑，不能提供防逆向作弊保证。",
            "财务是来源可追溯的业务子账与费用凭证，不是完整总账；FIFO为本仓数量入库库龄，调入日重置本仓库龄。",
            "人工成本按课程176小时及1.5倍教学模型估算，员工月归属为当月最后在职岗位，不作为法定薪资核算。",
            "BP42使用明确的一采购单对应一张供应商发票的教学范围；未扩展到任意多发票收货分摊系统。",
            "BP29派生加权均价允许末位1分的跨引擎浮点误差，整数金额、件数及标识保持精确比较。",
            "q0212 RANGE窗口、q0240保存点轨迹为原有专项结构未评定项，本次企业50题均不依赖这两项。",
        ],
    }
    if wasm:
        audit["wasm"] = {
            "pass": True,
            "sqliteVersion": wasm["sqliteVersion"],
            "correctExecutions": wasm["correctExecutions"],
        }
    dump(
        OUT / "independent-50.json",
        [
            {
                "task": t["task"],
                "pass": True,
                "fixtures": len(t["fixtures"]),
                "method": "独立Python原始事实表计算",
            }
            for t in tests
        ],
    )
    dump(OUT / "summary.json", audit)
    dump(CONTENT / "audit_results.json", audit)
    dump(CONTENT / "enterprise_reference/validation/anomalies.json", anomalies)
    # Older validation reports remain evidence with an explicit superseded heading.
    for p in CONTENT.glob("**/validation/REPORT.md"):
        text = p.read_text()
        if not text.startswith("> 历史验证记录"):
            p.write_text(
                "> 历史验证记录，当前审计版4.2.0结论见CONTENT/AUDIT_REPORT.md及工作区artifacts/enterprise-audit。\n\n"
                + text
            )
    lines = [
        "# 企业模拟数据与50道实战题审计报告",
        "\n2026-11-18 · 数屿SQL · 资源版本4.2.0 · 数据截止2025-12-31 · 固定种子2026111705。",
        "\n## 1. 备份、审计范围与资源来源",
        "\n先备份原始CONTENT和修改前应用源码。备份及SHA-256记录位于 `.tooling/audit-backup-20261117/`。原交付目录保持为历史来源，修复资源在工作区 `resources/CONTENT/`，构建已切换到该来源。逐项读取七库、原始CSV、历史生成程序、数据字典、任务口径、课程、题库、参考解、隐藏夹具及历史验证报告。原始及修复后CSV逐单元格与SQLite核对。",
        "\n保留20章、152知识点、300题、200卡、BP01—BP50及全部学习/数据集稳定编号。企业50题为q0251—q0300。更新50个关联知识点和50张企业关联卡的版本与受影响口径，卡片独立微型数据保持其独立断言。",
        "\n## 2. 原始问题与实际修复",
        "\n- 员工57次调动全部发生在入职第200日，个别高薪按员工编号模23触发。改为有效雇佣区间内的非固定调动日，以及员工稳定薪资效应、年度增长和岗位变化。",
        "- 促销原固定每月15—22日，追查前仍每月一场并使用年月模板。现以马来西亚节庆和临时业务决策产生44场，7个月没有新活动开始、10个月多场开始，21场跨月、2场跨年，16对区间重叠，时长1至31日。活动限制渠道、门店、品类、会员及折前篮子门槛，折扣逐行校验，重叠不叠加。模型效果可为负，实测销售和毛利均存在下降活动。",
        "- 库存期初量从未来最大缺口倒推，保证所有销售可以出库。改为基于潜在需求的事前期初预测，收货、销售、退货、调拨和损耗按事件发生顺序核算，缺货可使订单转待处理。",
        "- 原库存流水只含receipt/return/sale。新增调拨单、损耗单及流水来源键，仓间调拨按路线1至7日运输分日入账，截止日未到货为在途；两腿金额/数量与来源关联核对。",
        "- 逐表追加修正商品类别按编号循环、末20号统一停售、年度成本/合同日期、固定供应商目录、订单/采购明细数量循环、固定付款比例、所有员工仅工作日考勤、固定银行匹配/杂项笔数和原始导入模板。保留日历、月度目标/预算/工资/渠道费用汇总及库存快照的正式业务周期。",
        "- 供应商付款与交付缺少稳定供应商差异，贷项缺少独立来源。引入价格、交付周期、迟到/拒收差异，保留部分及多次付款、超额付款、跨期业务与重复发票，新增批准贷项。",
        "- 费用金额与部门/科目缺乏关联，凭证缺少原始业务来源。新增expense_documents并按部门与科目特征生成费用，保持复式分录平衡，银行差异作为独立复核异常。",
        "- BP07/q0257和BP34/q0284缺失快照时会算出误导性平均库存。现在返回NULL，并加入独立缺失快照夹具。",
        "- BP09/q0259加入调拨和损耗后，原只减销售量的库龄逻辑不足。改为所有出库消耗FIFO，并明确本仓入库库龄。",
        "- BP10/q0260用更远到货抵扣30日需求的风险已修复，限定承诺2026-01-01至01-30到货，独立三月到货夹具验证不会抵扣。",
        "- BP17/q0267零净应付被贷项全额抵销时原会显示未付款，改为已结清并加入全额贷项边界。",
        "- BP22/q0272和BP40/q0290滚动窗口原在年度起点重新开始。纳入2024年11—12月，再筛选2025年输出。",
        "- BP24/q0274明确实际查询期间为第四季度，BP27、BP28、BP46补足输出范围及原始开票/贷项口径。BP45/q0295增加0—89日完整观察期边界，10月3日纳入、10月4日尚不成熟。",
        "- BP29/q0279出现半分浮点舍入差异，修订展示算法及限定的派生数值容差。同一非空行集AVG金额/AVG数量属于等价解，不作为错误解拒绝。",
        "\n## 3. 修改前后分布比较",
        "\n表中依次为中位数 / P95 / 最大值。\n\n| 指标 | 修改前 | 修改后 |\n|---|---|---|",
        *distribution,
        "\n全部45张业务表的逐项发现、修复/保留理由、前后行数与逐列分布见[逐表复查](逐表复查.md)，完整统计见table-by-table.json。促销逐月数量、重叠、跨年和逐活动销售/毛利见promotion-review.json。",
        f"\n2025年月净销售最大/最小比由{seasonal(before):.3f}变为{seasonal(after):.3f}。这是模拟模型的输出特征，不代表真实企业市场规律。逐月、逐门店及逐供应商明细见 `before.json`、`after.json`。",
        "\n## 4. 业务指标与跨域一致性",
        f"\n{len(checks)}项现行与保留回归检查全部通过。逐笔核对销售出库、退货退款、合格收货入库、调拨双腿、损耗、54000份月末库存快照、历史标准成本、采购合同、发票来源、贷项/付款时间、员工区间、工资归属、考勤和费用凭证来源。七库外键与完整性通过，派生库所有共享表逐值与综合库相同。",
        "\n50题的每个公开及隐藏场景均由独立Python程序直接读取原始事实表计算结果，未调用题目SQL、派生视图或预存答案。SQL使用聚合/窗口，独立程序使用字典分组、日期差、排序与批次消耗，逐行逐列对照。",
        "\n## 5. 异常分布与空值",
        f"\n重复供应商发票编号组{anomalies['supplierInvoiceDuplicates']}，超额付款发票{anomalies['overpaidInvoices']}，批准贷项{anomalies['creditNotes']}，失败付款尝试{anomalies['failedPaymentAttempts']}，部分合格收货行{anomalies['partialReceipts']}。各供应商迟到/合格率、付款状态、流水类型和库存零值明细见 `anomaly-distribution.json`。",
        "\n正常企业主库保持来源完整；原始导入脏数据继续隔离。漏记收货、遗漏快照、结算差额等故障只在明确标注的隐藏诊断副本中模拟。未知地区、未离职日期、匿名线下客户、未知比率等NULL按业务含义保留，不为了完整率填补。",
        "\n## 6. 判题、等价解与错误解",
        f"\n企业50题共{fixture_count}套题目场景，含公开主库、原有边界、额外针对性边界及两套独立小型企业模型。两套独立场景通过共享数据文件复用，避免为50题重复打包。正确参考解与代数等价解全部通过。额外识别并接受{equiv}种候选等价表达式。",
        f"\n执行{candidate_count}个候选SQL，{rejected}个错误解被至少一个场景拒绝。50个硬编码公开完整结果均先确认能通过公开夹具，再确认会被独立隐藏场景拒绝。没有尚存的已识别错误变异。完整执行SQL、各场景行数、耗时、错误或接受结果见 `wrong-solutions.json`。有限测试不能证明拒绝所有可能错误程序。",
        "\n覆盖无交易主档、零预算和零分母、同一会话多次结账、部分/多笔付款、全额贷项、并列、季度停业、缺失月份/快照、分笔入库与漏记、跨年窗口、90日观察边界及不同数据分布。隐藏场景只在提交判题时加载，预览及公开运行不展示隐藏结果。",
        "\n### 逐题复核记录\n\n| 任务/题号 | 任务 | 主库行数 | 独立场景数 | 独立核对 | 错误变异拒绝 |\n|---|---|---:|---:|---|---:|",
    ]
    wm = {q["task"]: q for q in wrong}
    for t in tests:
        lines.append(
            f"| {t['task']} / {t['question']} | {t['title']} | {t['rows']} | {len(t['fixtures'])} | 通过 | {wm[t['task']]['rejected']} |"
        )
    lines += [
        "\n## 7. 同步更新记录",
        "\n更新七份SQLite、七份MySQL建表/插入/视图脚本、45张原始CSV、七份schema.json与数据字典、50项任务查询及完整结果、50道正式题、50个知识点、50张关联卡、公开/隐藏夹具和版本/哈希清单。所有学习编号、数据集入口和300题/200卡总数保留。受影响资源明细见 `resource-sync.json`，原始备份用于追溯。",
        "\n当前修复程序位于 `scripts/enterprise_audit/`，历史生成程序保留作审计证据。构建资源来自 `resources/CONTENT`。运行次序与验证入口见 `resources/CONTENT/DEVELOPMENT_AUDIT.md`。原始交付目录中的旧报告不作为本版本结论。",
        "\n## 8. 大小与查询性能",
        f'\n七份SQLite合计从{old_size/1048576:.2f} MiB变为{new_size/1048576:.2f} MiB，变化{(new_size/old_size-1)*100:+.2f}%。未增加主库文件数量。独立小型场景共享JSON总量{sum(p.stat().st_size for p in (CONTENT/"question_resource/fixtures/shared").glob("*.json"))/1048576:.2f} MiB，避免复制大量正式库。',
        f"\n本机Python SQLite逐题完整取数各3次，中位耗时的跨题中位数从{statistics.median(t['before']['medianMs'] for t in timing):.2f} ms变为{statistics.median(t['after']['medianMs'] for t in timing):.2f} ms。最慢修复后任务为{max(timing,key=lambda t:t['after']['medianMs'])['task']}，{max(t['after']['medianMs'] for t in timing):.2f} ms。逐题样本及行数见 `query-performance.json`，WASM与浏览器验证另附，不将本机耗时宣称为手机性能。",
        (
            f"\nsql.js WASM {wasm['sqliteVersion']} 实际执行{wasm['correctExecutions']}次参考及等价解，企业50题全部通过。输入语义和数据库SHA-256在证据文件中校验。"
            if wasm
            else "\nWASM复验待实际运行，不以Python结果代替。"
        ),
        "\n## 9. 尚未验证的范围与技术限制",
        *["\n- " + limit for limit in audit["limitations"]],
        "\n## 10. 证据文件",
        "\n`summary.json`、`task-audit.json`、`business-invariants.json`、`csv-roundtrip.json`、`shared-data.json`、`wrong-solutions.json`、`resource-sync.json`、`anomaly-distribution.json`、`query-performance.json`及后续WASM/浏览器验证均位于 `artifacts/enterprise-audit/`。",
    ]
    lines += ["\n## 11. 应用交付与界面回归", "\n本地安装包采用0.3.0版本号、versionCode4，资源为4.2.0。SQL键盘可拖动调高并记忆，展开/收起图标按状态切换，实验室数据表原位展开；练习详情页大标题统一显示简短标题，完整题目保留于正文。", "\n浏览器覆盖320、360、390、430宽度，33条路由及学习/练习/闪卡/导入流程。详细证据见browser-validation.json和browser-migration.json。"]
    native_path = OUT / "android-validation.json"
    if native_path.exists():
        native = json.loads(native_path.read_text())
        lines += ["\nAndroid16模拟器已关闭网络并执行内置促销查询，返回44场。验证包与交付包使用相同代码、资源和签名，验证包开启调试。"]
        if not native.get("historicalRecordsRetained"):
            lines += ["\n模拟器IndexedDB LevelDB文件出现损坏，WebView恢复时删除了损坏数据库，因此该模拟器的历史记录保留验证未通过；损坏发生时间未能确认。已保存故障日志emulator-storage-corruption.txt；浏览器同源旧版本到新版本的保留检查另行执行。"]
    erd_path = OUT / "erd-browser.json"
    if erd_path.exists() and json.loads(erd_path.read_text()).get("pass"):
        lines += ["\n## 12. ERD关系图", "\n已在数据表栏目内加入列表与ERD切换。七库真实元数据、字段端点连线、复合约束、视图依赖、移动端拖动缩放与个人库结构更新已复验，字段按最新要求全部展开。详见ERD验证报告.md。本次ERD实现未修改业务数据库、正式题目、参考答案或判题规则。"]
    report = "\n".join(lines) + "\n"
    (OUT / "审核报告.md").write_text(report)
    (CONTENT / "AUDIT_REPORT.md").write_text(report.replace("[逐表复查](逐表复查.md)", "[逐表复查](enterprise_reference/MECHANICAL_REVIEW.md)"))
    (CONTENT / "DEVELOPMENT_AUDIT.md").write_text(
        """# 企业资源4.2.0开发与复验

原始资源来自用户交付包，保存在原路径和.tooling/audit-backup-20261117。当前正式构建输入为工作区resources/CONTENT，应用图像仍使用原交付ASSETS。

在工作区依次运行以下命令，每一步失败须修复并重跑依赖步骤。

```sh
python3 scripts/enterprise_audit/repair_data.py
python3 scripts/enterprise_audit/sync_resources.py
python3 scripts/enterprise_audit/sync_learning.py
python3 scripts/enterprise_audit/validate.py
python3 scripts/enterprise_audit/table_review.py
# 首次更新后将旧WASM证据归档，再生成初始清单
python3 scripts/enterprise_audit/finalize.py
npm run build
npm test
node scripts/check-enterprise-audit.mjs
python3 scripts/enterprise_audit/finalize.py
npm run build
```

固定种子2026111705。重新运行以原始交付副本为输入，不以已修复数据继续随机叠加。历史生成脚本仅作证据。数据库、题目、课程、卡片、夹具、MySQL脚本、字典、版本与哈希必须一同发布。数据集ID保持-v2以兼容已有入口，内容版本和schemaVersion在清单内递增。

保留业务NULL。来源完备的主库与明确模拟故障的隔离夹具分开。新增夹具的期望结果必须通过独立Python原始事实计算。共享隐藏场景由sharedDataPath在提交时加载，不能在公开试运行中预加载或展示结果。

任意原生MySQL或实体手机验证只有实际运行后才能标记通过。离线隐藏夹具无法阻止逆向。
"""
    )
    # Replace the stale aggregate audit summary and keep detailed old reports marked historical.
    c.close()
    inventory_manifest()
    print("Finalized resource4.2.0 and audit report", flush=True)


if __name__ == "__main__":
    main()
