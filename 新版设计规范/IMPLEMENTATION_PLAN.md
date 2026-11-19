# 数屿SQL 新版设计 · 分批实施计划（IMPLEMENTATION_PLAN.md）

**最终版（2026-11-20 第 08 阶段整合）**。把 `DESIGN.md` / `UI_SYSTEM.md` / `ILLUSTRATION.md` / `PRODUCT.md` 落地到正式软件的分批计划（批次范围、文件、顺序）。**代码落点、资源映射、首页岛/里程碑接入规则、各批步骤与验收细则见 `UI_MIGRATION.md`（所有批次必读）。** 本文件只是计划，**进度：B0–B3 已完成（2026-11-20）**，B4–B11 未开始；迄今改了 `src/style.css`、`app.js`、`store.js`，未改课程资源或插画。
每批开启独立对话，只读取该批“必读文档”即可执行。每批先读 `DESIGN_STATUS.md` 确认没有与本批相关的待确认项被忽略。

## 0. 全局规则（每批通用）
1. 先读项目根 `AGENTS.md`、`HANDOFF.md`；只改本批范围内文件；不重做已确认设计；不全仓库审核。
2. 复用现有组件与函数，避免重构。不得改动：课程正文与结构化结果（`resources/CONTENT/courses_resource/**`）、题库、闪卡、七套数据库、统计口径、`src/curriculum-progress.js` 判定逻辑、已转换 7 节的 `structured/lessons/*.json` 与哈希。不重跑历史生成脚本。
3. 旧资源（`resources/ASSETS/` 现有文件）保留；新资源另存 `resources/ASSETS/v2/`。**注意（2026-11-20 核对更正）**：`scripts/build.mjs` 整目录复制 `resources/ASSETS → dist/assets` 但过滤了所有 `.svg`/`.md`，因此 `milestone.svg` 不会进包，且 `v2/illustrations/final/source/`（约 28MB）与 `v2/illustrations/business/` 试验图会被打包。B10 须先改为白名单（见 `UI_MIGRATION.md` §5.2），其余批次新增的字体/图标资源也须确认进包。
4. 每批完成必须：`npm run build`、`npm test` 通过；运行相关 `scripts/check-*.mjs`（需先 `npm run preview`，端口 4173）；320/390 宽度截图核对、无整页横向溢出；更新 `HANDOFF.md` 的实际验证结果与 `DESIGN_STATUS.md`。
5. 不提交、不推送、不发布、不提升版本号，除非用户在该批明确要求（发布另行指令）。
6. 开工前先用脚本/截图记录基线（当前页面截图 + 测试结果），便于对比。
7. 凡规范标注“待确认”的项，先在对话中向用户确认，不自行决定。

## 1. 批次总览与顺序
`B0 → B1 → B2` 必须顺序执行（共用 `style.css`/`app.js`）；之后 `B3`–`B7` 按序执行（同样共用文件，不并行写同一文件）；`B8`（图标）、`B10`（插画）为纯资源制作，可与代码批并行，但接入 `app.js` 时须排在代码批之后；`B9` 依赖 B4；`B11` 最后。

| 批 | 名称 | 性质 | 前置预览 |
|---|---|---|---|
| B0 | 准备与基线 | 工具/资源准备，无界面变化 | 无 |
| B1 | 令牌与基础样式 | CSS | 已有（首页、课文页原型） |
| B2 | 全局组件 | CSS + app.js 外壳 | 底部面板、弹窗预览（待做） |
| B3 | 首页与数据岛 | app.js + 新组件 | 已有 |
| B4 | 课文详情页 | app.js + CSS | 已有 |
| B5 | 练习、答题反馈、手势 | app.js + CSS | 练习页预览（待做） |
| B6 | 路线、闪卡及其余页面换肤 | CSS 为主 | 闪卡页、路线页预览（待做） |
| B7 | 编辑器与键盘 | editor.js + CSS | 随 B5 练习页预览 |
| B8 | 图标重绘 | 资源 | 图标样张（待做） |
| B9 | 教学图解组件与“图示”块 | 数据结构 + 组件 | 样稿已完成并确认（2026-11-20）：`插画样稿/illustrations.html` |
| B10 | 插画接入：业务六图、状态插画、里程碑 | 构建白名单 + 接入 | 无需再预览：最终资源与里程碑矢量版已确认（`ILLUSTRATION.md` §12–§15）；正式接入待做 |
| B11 | 适配与总验收 | 验证 | — |

## 2. 各批详情

### B0 准备与基线
- **状态：已完成（2026-11-20）**。实际文件、验证结果与备注见 `DESIGN_STATUS.md` §2.2 与 `HANDOFF.md`“第 09 阶段进度”。字体取自本机 OFL 文件（未联网），合计 63,744 字节；对比脚本 34/34 通过；基线 build/test 与 320/390 截图存 `artifacts/design-v2-baseline/`。下一批 B1，必读见 §3。
- 目标：字体资源、对比度脚本、基线记录；不改界面。
- 范围：
  - 取得并子集化 IBM Plex Sans（400/600）与 JetBrains Mono（400/600）（均为 OFL，随附许可文本），存 `resources/ASSETS/fonts/`；记录体积（目标合计约 0.4MB）。
  - 新增 `scripts/check-design-contrast.mjs`：读取 `DESIGN.md` §4 的令牌组合，输出实测比值，失败则退出码非 0。
  - 记录基线：`npm run build`、`npm test` 结果；首页、课文、练习、闪卡、我的 320/390 截图（保存到 `artifacts/design-v2-baseline/`）。
- 复用：`scripts/build.mjs` 现有资源复制。
- 验收：字体文件与许可就位；脚本对当前令牌通过；基线记录完整。
- 必读：`DESIGN.md`、`UI_SYSTEM.md` §1。

### B1 令牌与基础样式
- **状态：已完成（2026-11-20）**。实际修改、验证（含 5 个原有失败的版式脚本）与遗留见 `DESIGN_STATUS.md` §2.2。下一批 B2。
- 范围：`src/style.css` 的 `:root` 令牌（第 3–15 行）及全部硬编码色值；`@font-face` 与字体栈；字阶；间距；圆角；边框阴影；`--page-inset`（18→16，<360 为 12）；`.page` 最大宽度（现 600 → 480，仅保护性）。
- 令牌映射（旧 → 新）：`--primary #416d87→#38607f`；`--background #f7fafb→#f2f6f8`；`--text #344d5c→#17293a`；`--muted #526b7b→#4f6272`；`--line #d5e3eb→#cfe0ea`；`--blue #e6f1f6→#e2ecf2`；`--green #327568→#2f7a58`；`--error #a34e46→#a33f35`；`--error-bg #f7e9e5→#fbeae6`；`--cream #fff8e6`、`--mint #e8f6ef` 逐处核对用途后改为 `--warn-bg #fff4d6` / `--ok-bg #e5f4ec` / `--sand`；新增 `--teal --sun --ctl --lake --card` 等。凡硬编码 `#416d87`、`#e6f1f6` 等旧值，按用途替换为令牌。
- 复用：现有类名（`.primary .outline .tonal .panel .progress` 等）不改名，仅改值。
- 验收：`check-design-contrast` 通过；全站无旧主色残留（grep 旧值）；build/tests 通过；`check-teaching-layout`、`check-complete-code` 等版式脚本通过（仅在断言涉及颜色/尺寸时更新断言，并记录）。
- 必读：`DESIGN.md`、`UI_SYSTEM.md` §1–§3。

### B2 全局组件
- **状态：已完成（2026-11-20）**。实际修改、验证与遗留见 `DESIGN_STATUS.md` §2.2。下一批 B3。
- 范围：底部导航、顶部栏、按钮五类、标签、卡片三形态、状态图标三态、进度条、底部弹出面板、弹窗、展开收起、设置“正文字号”两档。
- 文件：`src/style.css`；`src/app.js` 中 `shell`、`button`、`goButton`、面板/弹窗相关函数；设置页字号项（`src/store.js` 中设置项仅新增一个字段，兼容旧备份——先读 `store.js` 现有设置结构）。
- 复用：现有 `details/summary` 展开、既有弹窗/面板实现，仅换皮并补拖拽条/下滑关闭。
- 验收：触控区 ≥44 自动检查；底部面板可拖拽/下滑/遮罩/返回键关闭；弹窗遮罩不关闭；系统字体 1.3 倍不崩坏；`check-flows`、`check-ui-upgrade` 等通过。
- 必读：`UI_SYSTEM.md` §2–§4、§7；`DESIGN.md` §3。

### B3 首页与数据岛
- **状态：已完成（2026-11-20）**。实际修改、验证与遗留见 `DESIGN_STATUS.md` §2.2。下一批 B4。
- 范围：首页主卡（含进度岛）、次卡、入口、潮线、学习路线紧凑列表。进度岛规则以 `UI_MIGRATION.md` §5.1 为准。
- 文件：`src/app.js`（首页渲染，现 `learning-hero` 使用 `illustrations/states/state_home_learning`）；新增 `src/island.js`（纯函数 `islandSvg(litCount)`，返回内联 SVG）与 `src/decor.js`（等深线、潮线 SVG 片段）；`src/style.css`。
- 规则：`lit = Math.floor(12 × completedKnowledgePoints() ÷ knowledgePoints().length)`，总数为 0 → 0；全部完成 → 12；直接复用 `app.js` 现有 `completedKnowledgePoints` / `knowledgePoints`，不新增统计、不写死总数。
- 测试：新增 `tests/island.test.mjs`（0、1、23/80、79/80、80/80、总数 0）。
- 参考：`预览原型/home.html`（SVG 与布局）。
- 验收：不同进度下亮块数正确；<360 不遮挡进度数字；旧 `state_home_learning.png` 引用移除但文件保留；其余首页功能不变。
- 必读：`DESIGN.md` §3.3、`UI_SYSTEM.md` §6.1–§6.2、`ILLUSTRATION.md` §1。

### B4 课文详情页
- 范围：章节标题条、章节内导航、概念/语法/思路/数据栏目样式、分步执行行、代码展示（换行开关）、结果表格（预期/实际标记）、扩展折叠、辨析与易错卡片、页底按钮。
- 文件：`src/app.js` 课文渲染（`lessonCompleteCode`、`lessonExpected`、`lessonExtensions`、`lessonBreakdown`、`lessonTeaching` 等，约第 500–560 行）、`src/style.css`；`src/lesson-presentation.js`/`src/lesson-structure.js` **不改数据契约**。
- 要点：
  - 知识点内部编号默认不显示，仅调试模式显示（调试入口待确认，见状态文档）。
  - 分步执行：复用现有 `breakdown` 数据（片段步骤：片段 SQL/purpose/reason）。**行数徽章与步骤数据表仅在步骤带中间结果数据时显示**，现有 fragment 步骤无此数据，故 B4 只做“摘要行 + 当前步展开 + 片段标签”，徽章与数据变化表由 B9 提供数据后接入。
  - 保持：完整代码与运行按钮连续，预期结果默认可见，扩展默认折叠，关联练习/笔记/收藏/完成学习/导航。
- 参考：`预览原型/lesson.html`。
- 验收：`node --test tests/presentation.test.mjs tests/lesson-structure.test.mjs`；`check-teaching-layout`、`check-structured-lessons`、`check-complete-code`（320/390/975 宽度，7 节）全部通过；未转换 73 节继续展示旧字段；无整页横向溢出。
- 必读：`UI_SYSTEM.md` §5、§6.3；`DESIGN.md` §4；`PRODUCT.md` §3；`resources/CONTENT/courses_resource/structured/README.md`。

### B5 练习、答题反馈、手势
- 范围：题目页、两标签、长题干折叠、题型标签、答题状态条、预期/实际/差异三标签、提示/答案/解析展开、题目左右滑动切换。
- 文件：`src/app.js` 练习页与结果对照渲染；`src/style.css`；`src/question-progress.js` 不改。
- 要点：沿用现有判题与结果数据；差异标签中“缺/多”标记基于现有对比结果（先读现有对比实现，若无行级差异数据，先确认再补）。
- 验收：`check-inline-practice`、`check-flows`；手势防冲突各条逐项手测（代码块/编辑器/表格/键盘区起滑不触发，左缘 20px，首末题回弹）；键盘覆盖规则不变。
- 必读：`UI_SYSTEM.md` §5.2–§5.3、§6.5、§7；`PRODUCT.md` §3。

### B6 路线、闪卡及其余页面换肤
- 范围：学习路线（紧凑）、闪卡正反面与评级条、个人库、实战、统计与设置、ERD 与实验室外壳；仅令牌、组件、密度规则，不加栏目。
- 验收：`check-erd`、`check-ui-upgrade`、`check-page-refinement` 等通过；ERD 字段全展开不变。
- 必读：`UI_SYSTEM.md` §3、§6.2、§6.4、§6.6。

### B7 编辑器与键盘
- 范围：词法高亮配色（浅/深）、编辑器外观、键盘外观。
- 文件：`src/editor.js`（高亮标记）、`src/style.css` 的 `.sql-editor`、`.sql-editor.dark` 与 `--editor-*` 变量（约第 1089–1110 行）。
- 要点：所有 SQL 关键字统一一色；函数/字符串/数字/注释/字段名/运算符各一色；不改编辑器功能与深浅切换偏好存储。“当前行高亮、括号配对”须先核对现状：已有则调色，没有则属新增功能，先向用户确认再做。
- 验收：浅/深各色对比度脚本通过；撤销重做、全屏、键盘高度记忆、执行逻辑回归通过。
- 必读：`DESIGN.md` §4.3、`UI_SYSTEM.md` §5.2。

### B8 图标重绘
- 范围：12 个功能图标 + 5 个导航图标（选中/未选中）+ 通用图标统一线宽；新建 SVG 存 `resources/ASSETS/v2/icons/`；接入后旧 PNG/SVG 文件保留。
- 前置：先出图标样张，用户确认图案后再批量制作。
- 文件：`src/action-icons.js`（既有通用图标，统一线宽）、`src/app.js` 导航与功能图标引用。
- 验收：24 画板、线宽 1.75–2、圆头；选中态实心主色；日光黄每图标 ≤1 处；对比度与可辨识度在 20/24px 检查。
- 必读：`UI_SYSTEM.md` §4.1、§4.9；`DESIGN.md` §4。

### B9 教学图解组件与“图示”块
- **样稿状态（2026-11-19）**：组件库已在 `插画样稿/figures.js` 以课程数据驱动方式验证（数据由 `build_data.py` 生成并用 SQLite 核对）；正式实现可沿用其组件划分与数据字段，但“图示”块存放方式（待确认项 4）仍须先确认。
- 前置：先在对话中确认图示块的数据结构与存放方式（建议：新增独立文件 `structured/figures/kpNN-NN.json` 并在 `manifest.json` 登记，不改 `structured/lessons/*.json`），经用户确认后再开工。
- 范围：组件库（迷你表、标注、箭头、对比容器、行条、行数徽章、色标竖条、占位符块等）；概念图、语法结构图、函数图、执行流水线/数据变化/表关系图、指标公式卡；交互（点按高亮、占位符展开、样例切换、步进）。
- 文件：新增 `src/figures.js`（渲染）、`src/style.css`；`src/lesson-structure.js` 增加可选图示校验（不放宽既有检查）；构建脚本 `scripts/course-structure-resources.mjs` 挂接图示数据；新增检查脚本验证图示数据与已验证执行结果一致（沿用 `scripts/check-structured-lessons.mjs` 的 Worker 执行方式）。
- 试点：以 kp05-01 为样例（三值逻辑概念图、语法结构图、`WHERE value <> 10` 分步数据变化）；再按已转换课程逐节扩展；**未转换的 73 节不生成图解**。
- 验收：图中每个数值可追溯到课程示例数据与实际执行结果；所有标注为真实文本；320/390 无溢出；已转换 7 节原文与哈希不变；`tests/lesson-structure.test.mjs`、`presentation.test.mjs` 通过并新增图示用例。
- 必读：`ILLUSTRATION.md` §0、§4–§8；`UI_SYSTEM.md` §6.3；`resources/CONTENT/courses_resource/structured/README.md`；`HANDOFF.md`。

### B10 插画接入：业务六图、状态插画、里程碑
- **资源均已确认，无需再做试验、样张或预览**（`ILLUSTRATION.md` §12–§14）：`resources/ASSETS/v2/illustrations/final/` 的 14 张 PNG（用户提供，不重绘不调色）与 `milestone/milestone.svg`。早期“业务六图可行性试验”“状态岛 SVG 变体”均已作废（`v2/illustrations/business/` 试验图不得接入、不得打包）。
- 范围：①`scripts/build.mjs` 资源白名单（含 `.svg` 的里程碑；排除 `final/source`、`business`、`tools`、`test.html`、`.md`）；②扩展 `image()`（新路径，SVG 里程碑内联）与 `empty()`（插画参数，默认 08）；③替换业务六图三处引用（首页入口、实战列表、项目详情）；④替换空态/就绪/备份成功/加载失败等状态图；⑤里程碑矢量注入与一次性动画（今日闪卡完成页）；⑥旧 `illustrations/states/*`、`illustrations/business/*` 引用移除，文件保留。
- 接入映射、里程碑规则、减少动画、无障碍：`UI_MIGRATION.md` §4–§5。**§8 中 #17–#22 待确认项未确认前，对应场景不接入**（章节/全部课程完成页、鼓励页、统计空态、启动失败页、备份成功显示时机、品牌岛位置）。
- 验收：包内资源清单无 `source/`、试验图、分层素材；业务六图 1:1 与 3:1 裁切主体完整；状态图内无文字、装饰图不朗读；里程碑约 600ms 一次、保持最终态；减少动画直接最终态；资源总体积已记录；不遮挡学习内容。
- 必读：`ILLUSTRATION.md` §12–§15、`UI_MIGRATION.md`、`DESIGN.md` §5；`resources/ASSETS/v2/illustrations/final/MANIFEST.md`、`milestone/README.md`。

### B11 适配与总验收
- 范围：320/360/390/430 多宽度截图、系统字体 1.3 倍、顶部/底部安全区、折叠屏宽度保护（内容最大 480）、键盘与 `adjustResize`、竖屏锁定；Android 模拟器覆盖安装与 WebView 内 SQL 按钮执行；全部自动测试与 `check-*.mjs`；更新 `HANDOFF.md`、`DESIGN_STATUS.md`。
- 验收：全部勾选；未执行的验证（实体机、MySQL 8.4 等）如实记录为未验证，不冒充通过。发布与版本号由用户另行指令。
- 必读：`UI_SYSTEM.md` §8、本文件 §0 与 §4。

## 3. 每批必读文档清单
| 批 | 必读 |
|---|---|
| B0 | `DESIGN.md`、`UI_SYSTEM.md`§1 |
| B1 | `DESIGN.md`、`UI_SYSTEM.md`§1–§3 |
| B2 | `UI_SYSTEM.md`§2–§4,§7、`DESIGN.md`§3 |
| B3 | `DESIGN.md`§3.3,§5、`UI_SYSTEM.md`§6.1–§6.2、`ILLUSTRATION.md`§1 |
| B4 | `UI_SYSTEM.md`§5,§6.3、`DESIGN.md`§4、`PRODUCT.md`§3、课程结构化 `README.md` |
| B5 | `UI_SYSTEM.md`§5.2–§5.3,§6.5,§7、`PRODUCT.md`§3 |
| B6 | `UI_SYSTEM.md`§3,§6.2,§6.4,§6.6 |
| B7 | `DESIGN.md`§4.3、`UI_SYSTEM.md`§5.2 |
| B8 | `UI_SYSTEM.md`§4.1,§4.9、`DESIGN.md`§4 |
| B9 | `ILLUSTRATION.md`§0,§4–§8、`UI_SYSTEM.md`§6.3、课程结构化 `README.md`、`HANDOFF.md` |
| B10 | `ILLUSTRATION.md`§12–§15（最终资源与使用规则、里程碑矢量素材与动画、复用关系与路径速查、留待事项）、`DESIGN.md`§5、`UI_MIGRATION.md`§4–§5,§8；另读 `resources/ASSETS/v2/illustrations/final/MANIFEST.md` 与 `milestone/README.md` |
| B11 | `UI_SYSTEM.md`§8、本文件§0,§4 |
**所有批次另需读**：项目根 `AGENTS.md`、`HANDOFF.md`、`新版设计规范/DESIGN_STATUS.md`（待确认事项）、`新版设计规范/UI_MIGRATION.md`（对应批次的 §7 步骤与验收，及 §8 待确认项）。

## 4. 剩余预览任务（批次前置；仅手机宽度，不改正式代码）
已完成并确认：首页、课文页（`预览原型/`）；插画样稿与最终插画资源、里程碑动画（`插画样稿/`、`resources/ASSETS/v2/illustrations/`）。**B3、B4、B9（样稿部分）、B10 不再需要新预览。**
待做：①练习页（题目标签 + 编辑器 + 键盘 + 状态条 + 三标签对照 + 长题干折叠）→ B5/B7；②闪卡正反面、学习路线展开 → B6；③底部面板与确认弹窗 → B2；④图标样张（17 个 + 通用图标）→ B8。
已作废：“状态岛与业务插画可行性试验”（被最终资源取代）。

## 5. 通用验收清单（每批）
- 构建与测试：`npm run build`；`npm test`（现有 7 个测试文件）；相关 `scripts/check-*.mjs`（依赖 `npm run preview`）。
- 视觉：320 / 390 宽度截图；无整页横向溢出；触控区 ≥44；对比度脚本通过。
- 回归：已转换 7 节与 73 节旧课文展示；关联练习/笔记/收藏/完成学习/导航；运行按钮与预期结果顺序；练习键盘覆盖；ERD 字段全展开；备份/恢复。
- 资源：新增资源后按 `HANDOFF.md` 现行方式刷新资源清单并确认构建校验通过（先读相关脚本说明，避免误重写课文）。
- 文档：更新 `HANDOFF.md`（版本、已完成批次、实际验证结果）与 `DESIGN_STATUS.md`。
