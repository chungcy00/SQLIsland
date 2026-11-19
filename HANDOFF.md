# 数屿 SQL 开发交接

更新日期：2026-11-19。当前任务为课程资源导入、独立结构化存储和统一渲染；不得重新决定课程取舍或重新生成已完成课文。

## 当前版本与进度

- 软件版本：0.3.8（versionCode 12），已推送 main 并发布 GitHub 最新 Release v0.3.8。发布源码提交：95f307f8c580d1b07e1b813462f88e3b332c51b3。本地预览 http://127.0.0.1:4173/ 。
- 正式课程保持 20 模块、4 学习阶段、80 节；题库 200 道、闪卡 200 张，原编号及用户记录机制保留。
- 外部资源：第一批 7 节课程包，原包说明基于课程 5.0.0，来源课对照提交 57437dd。项目内批次标签 `5.0.0-batch1`，不是外部另行发布的版本号。
- 目前只收到第一批 7 节，不能把余下 73 节旧版内容视为新版外部资源。先保留其现有课程功能，等待后续包。
- 已导入且已结构化转换：kp01-01、kp01-02、kp01-03、kp02-01、kp02-02、kp05-01、kp05-02。
- 待外部资源导入及结构化转换：kp03-01、kp03-02、kp03-03、kp03-04、kp04-01、kp04-02、kp06-01、kp06-02、kp06-03、kp07-01、kp07-02、kp07-03、kp08-01、kp08-02、kp08-03、kp08-04、kp08-05、kp09-01、kp09-02、kp09-03、kp10-01、kp10-02、kp10-03、kp10-04、kp11-01、kp11-02、kp11-03、kp12-01、kp12-02、kp12-03、kp12-04、kp13-01、kp13-02、kp14-01、kp15-01、kp15-02、kp15-03、kp15-04、kp15-05、kp16-01、kp16-02、kp16-03、kp17-01、kp17-02、kp18-01、kp19-01、kp19-02、kp19-03、kp19-32、kp19-33、kp19-36、kp19-41、kp19-42、kp19-43、kp19-46、kp19-47、kp19-48、kp19-49、kp19-50、kp19-52、kp19-56、kp19-57、kp19-58、kp20-01、kp20-02、kp20-03、kp20-06、kp20-08、kp20-13、kp20-15、kp20-18、kp20-21、kp20-23。

## 资源与实现位置

| 文件 | 用途 |
|---|---|
| AGENTS.md | 新开发工具的续作入口，要求先读交接记录及结构规范 |
| resources/CONTENT/courses_resource/source/batch1/ | 原包 6 个文件逐字节归档；7 节导入后快照，作为版本依据 |
| resources/CONTENT/courses_resource/courses/ch01.json、ch02.json、ch05.json | 按原编号导入的原始课程字段；不再嵌入展示补丁 |
| resources/CONTENT/courses_resource/reading/ch01.md、ch02.md、ch05.md | 导入正文阅读版，沿用原包内容 |
| resources/CONTENT/courses_resource/structured/manifest.json | 原包、已转换编号及哈希 |
| resources/CONTENT/courses_resource/structured/lessons/ | 已保存的 7 节结构化结果，后续不重复转换 |
| resources/CONTENT/courses_resource/structured/README.md | 数据契约、渲染规则及后续导入命令 |
| src/lesson-structure.js | 共享结构校验，拒绝丢失概念文字、错误表名、不对应的片段及执行代码变化 |
| scripts/course-structure-resources.mjs、scripts/build.mjs | 构建校验来源及哈希，把持久化结果挂到 lesson.presentation，离线打包 |
| scripts/import-course-structure.mjs | 仅导入已编排结果；相同内容跳过，不同已转换内容需要显式 --replace |
| scripts/refresh-course-integrity.mjs | 更新课程及总资源哈希清单，不重写课文 |
| src/app.js、src/lesson-presentation.js、src/style.css | 共用块渲染和原有教学区顺序；移除运行时正文拆分逻辑 |
| tests/lesson-structure.test.mjs、tests/presentation.test.mjs | 来源、完整性、片段、结果及重复导入保护测试 |
| scripts/check-structured-lessons.mjs | 第一批 16 个原包执行记录在实际应用 Worker 中核对 |
| scripts/check-teaching-layout.mjs、scripts/check-complete-code.mjs | 多宽度版式、示例顺序和实际按钮执行校验 |
| resources/CONTENT/courses_resource/validation/structured-courses.json | 本批结构检查、转换/待处理编号及实际执行结果 |

## 已确定的数据结构与渲染规则

结构化规范 v1：来源标识/哈希、teachingKind、conceptBlocks、syntax.purpose、dataDescriptions、problem、methodBlocks、breakdown、completeCode、expectedResult、resultBlocks、extensions、cautions。块支持小标题、段落、项目符号、显式重点、表格和代码。无运行时按句号、换行或固定字数生成教学步骤。

完整代码保留原 MySQL 与兼容 SQL；验证两者均与导入课程一致。片段有明确的不可独立运行标识，分步完整查询需独立夹具和中间结果。完整代码与运行按钮连续。执行思路仍在示例数据前、保持简短编号。

代码教学顺序：业务需求 → 查询思路 → 代码拆解/分步 → 完整代码 → 运行按钮 → 预期结果 → 结果解读 → 默认折叠扩展。字段/单位/粒度/关系说明在示例表旁。预期结果默认可见，实际运行结果单独标记。辨析、错误、原因、修正及注意事项分别保存。保留关联练习、笔记、收藏、完成学习和上下节导航功能。

未转换的 73 节继续使用旧字段，不擅自生成替代教学结构，不计入已转换数量。

## 内容修正与完整性记录

- 原始外部字段补丁保持一致，kp05-01 匿名订单扩展单独使用原有 orders 夹具；未更改主查询、主数据或结果。
- 此次是已完成展示结果的独立存储迁移。保留 7 节原概念完整文字和已编排标题/对比/拆解；不重新生成课程。
- 原说明中的“ORDER BY 可用输出别名”“-1 可能为合法值时另设缺失标记”“具体连接与聚合后续展开”分别归入扩展讲解、对应片段原因及语法用途，避免展示迁移时遗漏。
- 本批没有发现并修改源查询逻辑或数值。原包逐字节保留，必要的展示说明与原字段分开存储。

## 已完成验证

- 发布前全部 28 项自动测试通过；结构与展示相关 5 项测试通过，包括来源/字段一致性、完整概念文字、片段与完整 SQL 对应、错误资源拒绝、重复导入无写入。
- 7 节 × 320/390/975 像素浏览器检查通过：栏目顺序、表旁说明、片段、完整代码/按钮、预期/实际区分、折叠扩展、独立横向滚动，无整页横向溢出和页面错误。
- 第一批 16 个主/扩展查询，在实际浏览器 SQL Worker 中执行，列及全部行与归档的原包执行记录一致。详见 validation/structured-courses.json。
- 未转换课程继续展示原有 mergedConcepts 合并知识说明，已加入 80 节回归检查。
- 80 节主示例的完整代码展示、运行按钮相邻、实际执行及预期结果核对通过；此项属于共用渲染回归，不代表余下 73 节已重新转换。
- 构建与签名检查通过：877 个离线文件、七套数据库与字典校验一致；签名与 0.3.7 相同。
- Android 16 模拟器从 0.3.7 覆盖安装正式 0.3.8 成功；第一节结构化概念页面及原生 WebView 的 SQL 按钮执行通过，实际返回 5 行。
- 手机多宽度检查使用桌面 Chrome 模拟；尚未进行实体手机验收或 MySQL 8.4 原生复验。

## 未解决项与下一步

1. 等待其余 73 节的外部课程资源。收到后只导入新批次指定字段；按原始编号和既定合并映射保留关联及历史。
2. 将新原包和导入快照归档并登记批次，按语义转换尚未完成的课程；不要重跑第一批转换。使用统一块结构，不另写课程页面组件。
3. 为新批次追加独立的源码/夹具/中间结果验证，不改变第一批已完成记录。
4. 每批导入后更新本文的版本、编号、文件用途、真实验证结果和待处理项。刷新资源哈希并构建。
5. 0.3.8 已发布为 GitHub 最新版本：https://github.com/chungcy00/SQLIsland/releases/tag/v0.3.8 。APK 与 update.json 均已上传；APK SHA-256：77a801a9d7662e3d35c422b9411f191a70326a2efe827650f57d4ded78a20af2。用户可从应用“我的 → 版本更新”检查新版。后续仅在用户要求时另行发布。
