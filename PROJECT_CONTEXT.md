# 数屿SQL 项目接管上下文（PROJECT_CONTEXT）

接管日期：2026-11-19 ｜ 接管方：Claude Code（自 Codex）｜ 状态：**已接管，暂停开发**，当前阶段仅讨论视觉（色系/界面风格/插画）。
> **【2026-11-20 更新】** 下方“暂停开发/仅讨论视觉”已过时：新版设计规范已于第 08 阶段整合为最终版，当前入口为 `HANDOFF.md` 与 `新版设计规范/DESIGN_STATUS.md`、`UI_MIGRATION.md`；本文件其余内容按历史接管记录对待。

后续对话优先读本文件；细节再查下列权威文档，不必重新分析整个交接包。

## 1. 位置

| 项 | 路径 |
|---|---|
| 主工程（现行，git main） | `/Users/caiying/Downloads/SQL离线学习/` |
| 交接包（只读参考，含验证记录/原始需求/设计稿） | `/Users/caiying/Downloads/数屿SQL_开发交接包/` |
| 远程仓库 | github.com/chungcy00/SQLIsland（不修改） |

权威文档：`HANDOFF.md`（工程根）、`resources/CONTENT/courses_resource/structured/README.md`（数据契约）、交接包 `REQUIREMENTS.md`（最终需求，覆盖旧 PRD）、`TASKS.md`、`VALIDATION.md`、`FILE_INDEX.md`、`CLAUDE.md`。

## 2. 定位与架构

- 安卓**离线**中文 SQL 学习软件，包名 `cn.sqlstudy.offline`，应用名 数屿SQL，最低 Android 10，测试设备 Android 16。
- 技术：Java 原生容器 + 本地 WebView + 原生 JS（非 React/PWA/Kotlin）；sql.js（SQLite WASM）在 Worker 中执行；IndexedDB 保存用户记录；ts-fsrs 闪卡调度；dagre 做 ERD 布局；esbuild 构建；playwright 做浏览器检查。
- 无在线判题 / 运行时 AI / 账号 / 云同步 / 自定义题目。
- 版本：**0.3.8（versionCode 12）**，已发布 GitHub Release v0.3.8；main HEAD `d5ff9d7`，功能提交 `95f307f`。APK SHA-256 `77a801a9…ed78a20af2`（877 个离线文件）。
- 源码规模：`src/app.js` 2796 行、`src/style.css` 2236 行；其余模块 `editor.js engine.js erd*.js store.js lesson-structure.js lesson-presentation.js sql-worker.js updates.js` 等。

## 3. 功能模块

五项固定底部导航：首页 → 学习 → 练习 → 闪卡 → 我的。
学习路线（4 阶段/20 章/80 节）、练习（5 题型，本地兼容 SQL 判题）、闪卡（FSRS，背面四级评级）、代码实验室（七库、查询历史/收藏、结果导出）、ERD（真实 SQLite 元数据，字段全展开）、实战项目（六业务项目）、个人库（错题/收藏/个人闪卡/导入）、统计与设置（备份恢复、资源检查、SQL 键盘高度记忆）、版本更新（我的 → 版本更新，GitHub 覆盖更新）。

## 4. 学习内容结构（核对通过）

- 20 章 / 4 阶段 / **80 节**（各章 kp 数相加 = 80，与 `courses/chNN.json` 实测一致）；152→80 的合并映射（53 并入、19 退出）见 `REQUIREMENTS.md`，原编号不变。
- 题库 **200 题**（白名单，4 题实质改编；5 题型：独立编写 93 / 选择 26 / 填空 27 / 纠错 18 / 业务情景 36）；闪卡 **200 张**（6 类，含 30 张结果预测卡，保留）；七套 SQLite 业务库；当前企业题 28 道。
- 资源目录：`resources/CONTENT/{courses_resource,question_resource,flashcard_resource,enterprise_reference}`；课程来源 `courses_resource/source/batch1/`；结构化结果 `structured/lessons/`。
- 教学页固定顺序：核心概念 → 语法 → 执行思路 → 示例数据 → SQL 示例（需求→思路→拆解→完整代码→运行按钮→预期结果→解读→折叠扩展）→ 辨析与易错点。预期结果默认可见；完整代码与运行按钮紧邻；运行时不按句号/字数生成教学内容。

## 5. 实际开发进度

**已完成（已发布）**：80 节目录与进度/笔记/收藏迁移兼容；200 题 / 200 卡关联；七库及 ERD；学习/练习/实验室 UI；**第一批 7 节外部课程已导入并结构化**：kp01-01、kp01-02、kp01-03、kp02-01、kp02-02、kp05-01、kp05-02（16 个主/扩展查询在 SQL Worker 中核对一致）；共用结构化渲染；0.3.8 签名覆盖安装与原生 SQL 按钮在 Android 16 模拟器通过。

**部分完成**：其余 **73 节**仍展示旧版 mergedConcepts（可读、80 节主查询均执行通过），但**不是新版外部资源，不计入已转换**。

**未完成/未验证**：73 节新版外部课文（待用户提供）；MySQL 8.4 原生复验；实体 Android 10/16 手机验收；手机大库/大 ERD 性能；综合测试会话、掌握度权重、导入字段配置等历史 PRD 功能（须用户指定才做）。

**开发中断点**：**等待下一批外部课文**，非代码写到一半。下一项按正式目录为 **kp03-01**（无其新版正文，不得猜写）。待导入编号共 73，完整清单见 `HANDOFF.md` 第 12 行。接收新包后流程：归档原包 → 只导入指定字段 → 语义结构化 → `node scripts/import-course-structure.mjs` → build/测试/浏览器验证 → 更新 HANDOFF。

## 6. 禁止事项（保持）

不重写/重跑已转换 7 节或历史生成脚本；不恢复 152 节/300 题/预测练习；不补回已删企业题；不重做业务库随机化；不重写 200 闪卡；不自行发布；不推送；已知结构校验限制（conceptBlocks 须逐字还原 concept）需用具体案例解决，不得关闭保护。

## 7. 视觉规范与资源位置（旧版，仅作参考）

接下来视觉将重新讨论；以下为现状，**功能、教学逻辑、验证标准不随之改变**。

- 设计规范文本：`DESIGN.md`（令牌、尺寸、页面映射、冲突修正表）、`PRODUCT.md`；样式实现 `src/style.css`（`:root` 变量）、`src/index.html`。
- 现行令牌：海盐蓝系 `#5B7F9C / #8FB1C8 / #BED7E6 / #E6F1F6`，辅助暖米 `#FFF8E6`、薄荷 `#E8F6EF`，背景 `#F7FAFB`，主文字 `#344D5C`，操作主色 `#416D87`，描边 `#D5E3EB`；**禁紫色**（含语法高亮）；基准宽 390，边距 16，卡片圆角 14–18，触控 ≥44，对比度 ≥4.5:1。
- 素材 `resources/ASSETS/`（含 `INDEX.md`）：`brand/`（7：app_icon_5 系列、logo_d）、`functions/`（24：12 个功能图标 png+svg）、`navigation/`（20：5 项导航选中/未选中 png+svg）、`illustrations/business/`（6 张业务插画）与 `illustrations/states/`（6 张状态插画：备份、空态、闪卡复习、首页学习、学习完成、离线就绪），均 1254×1254 透明 PNG；扁平双色风格。
- 应用桌面图标（用户确认原图）：`.codex-attachments/`（工程根，未跟踪）；交接包副本 `参考资料/最终应用图标/1000036614.png`。安卓资源 `android/app/src/main/res/`。
- 原设计稿：交接包 `参考资料/sql_final_delivery/UI/`（8 组页面 + `INDEX.md`）；AI Studio 排版参考 `参考资料/AIStudio排版参考/`（仅借鉴内页顺序/层级/按钮弧度）。
- 换色系/插画将波及：`style.css` 令牌与硬编码色值（约 12+ 个独立色）、`resources/ASSETS` 全部 png/svg、`android/…/res` 图标、`dist/` 构建产物、`update.json`/release 说明（发布时）。

## 8. 核对结果与发现的问题

- 交接包 `工具/verify_handoff.py` 实测通过：2945 文件，版本 0.3.8，20 章/4 阶段/80 节/200 题/200 卡/7 库，已转换 7 / 待处理 73，APK 哈希匹配。
- 工程与交接包源码一致，仅登记的差异：`scripts/build-apk.sh`（包内版去除内嵌签名口令/自动生成密钥）。
- 次要差异（无需处理）：工程多出 `android/app/src/main/res/drawable`、`__pycache__`、旧版测试 APK/截图（均为生成物或历史产物，包内有意未带）。
- git：`main` 与记录一致；未跟踪项 `.codex-attachments/`（图标原图，应保留）和 `.claude/`（本工具本地设置，建议不入库）。
- **文档陈旧点**：`PRODUCT.md` 仍写“152 知识点、300 题”，已被 80/200 取代（以 HANDOFF/REQUIREMENTS 为准，未修改）；`DESIGN.md` 部分页面映射含旧口径，同样以 REQUIREMENTS 为准。
- 本阶段**未**：运行 build/测试、启动预览、读取题卡内容、修改任何源码/设计、触碰远程仓库。
- 交接包签名私钥未随包；正式覆盖更新发布前需用户安全提供原私钥。
