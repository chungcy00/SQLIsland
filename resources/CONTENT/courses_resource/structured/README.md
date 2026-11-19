# 结构化课程资源规范 v1

内容来源与进度见项目根目录 `HANDOFF.md`。本目录保存经过语义整理的展示数据，不替代原始课文，不在运行时生成正文。

## 文件与版本

- `../source/batch1/`：原始外部包逐字节归档，以及按原编号导入后的 7 节快照。原包自述基于课程 5.0.0；`5.0.0-batch1` 是本项目导入批次标签。
- `manifest.json`：资源版本、来源文件校验值、已转换编号和结构化文件校验值。
- `lessons/kpNN-NN.json`：每节一次性转换后的内容块。
- 仓库根目录下的 `src/lesson-structure.js`：共享校验器，供导入、构建及测试使用。

原有 `courses/chNN.json` 保持导入后的课程字段，题目/闪卡关联、运行代码、初始化条件、原始样本和用户记录机制沿用原功能。转换结果不再放在 `teaching.presentation` 内。构建阶段将单独文件挂到内存中的 `lesson.presentation`，写入离线 `content.json`；浏览器无需访问外部资源或在线服务。

## 每节数据结构

| 字段 | 内容与约束 |
|---|---|
| schemaVersion / id | 当前为 1；保留知识点原编号 |
| sourceBatch / sourcePath / sourceSha256 | 归档批次、导入后快照及 SHA-256；构建检查来源是否变化 |
| teachingKind | concept / syntax / function / advanced / business；由内容确定，不用于强制统一步骤数量 |
| conceptBlocks | 有语义边界的小标题、段落、列表、对比表等；原概念正文可完整还原 |
| syntax.purpose | 核心模板或概念说明的用途，以及与主查询的区别 |
| dataDescriptions | 按真实样本表名保存字段、单位、粒度及关系说明 |
| problem / methodBlocks | 实际需求与查询推导；不重复放入核心概念 |
| breakdown | 每步有 kind、title、sql、purpose、reason |
| completeCode | mysqlSql、sqliteSql；必须与原课程执行代码一致 |
| expectedResult / resultBlocks | 原预期结果、结果解读；结果默认显示 |
| extensions | 原扩展示例的用途标题、SQL、夹具、预期结果及 explanationBlocks |
| cautions | comparison / example / reason / correction / notes 五组内容块 |

通用块类型：`heading`、`paragraph` 使用 `text`；`list` 使用 `items`；`table` 使用 `columns` 与 `rows`；`code` 使用 `sql`。正文可带 `emphasis` 词组，词组必须确实出现在文字中；列表项支持字符串或 `{text, emphasis}`。对比表、函数输入输出表及数据变化表复用既有横向滚动表格。不为了格式完整强行添加图示。

`fragment` 步骤只展示片段，明确标为不能独立执行，不提供运行入口。`runnable` 步骤必须带完整的 `sourceTables`、必要的 `setupSql` 和 `result`；其 SQL 必须可在独立初始化环境中执行。未提供完整运行条件的步骤不得标为 runnable。

## 固定渲染规则

保留现有栏目及色系：核心概念 → 语法 → 执行思路 → 示例数据 → SQL 示例 → 辨析与易错点。执行思路仍是前置短编号列表。字段说明紧邻对应示例表。

SQL 示例内部：实际需求 → 查询思路 → 拆解/分步 → 完整代码 → 运行按钮 → 预期结果 → 解读 → 默认折叠的扩展示例。实际执行结果单独标记。本页主按钮只执行该完整查询的兼容 SQL；不执行片段或扩展末尾的 SQL。

未转换课程继续使用原字段展示，不自动按句子生成标题、步骤或错误原因；不计入已转换数量。

## 后续批次执行

1. 先归档外部原包，按原编号仅导入指定字段，保留其他字段、关联及历史；登记来源批次与文件哈希。
2. 只处理新批次尚未转换的课程。按原文语义编排块并存为结构化 JSON，明确补充必要标题和内容归属；不得自动平均拆分句子。课程正文错误只修复明确错误，另行记录。
3. 使用 `node scripts/import-course-structure.mjs FILE.json` 导入已经整理完毕的结构化文件。相同内容自动跳过，已转换文件内容不同则拒绝；只有明确修正时使用 `--replace`。导入命令不负责生成或重写课文。
4. `npm run build` 校验来源、完整概念文字、表名、片段、完整查询、扩展示例及预期结果；执行相应批次的浏览器/SQL 验证。
5. 更新验证报告与 `HANDOFF.md` 的版本、编号、剩余项、文件用途及下一步。运行 `node scripts/refresh-course-integrity.mjs` 刷新资源清单后再构建。

第一批复验：`node --test tests/lesson-structure.test.mjs tests/presentation.test.mjs`、`node scripts/check-structured-lessons.mjs`、`node scripts/check-teaching-layout.mjs`。浏览器脚本依赖本地 4173 预览服务。
