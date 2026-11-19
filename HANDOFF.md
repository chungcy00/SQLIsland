# 数屿 SQL 开发交接

更新日期：2026-11-20。

**当前阶段**：
- 课程资源导入、独立结构化存储和统一渲染（原有任务，进度与待办见下文，未改动）；不得重新决定课程取舍或重新生成已完成课文。
- 新版视觉设计与插画预览阶段**已完成并经用户确认**；**第 08 阶段（2026-11-20）已把设计规范整合为最终版**并新增迁移方案 `新版设计规范/UI_MIGRATION.md`（见下文“新版设计规范与插画”一节）。**第 09 阶段 B0（准备与基线）已于 2026-11-20 完成（见下文“第 09 阶段进度”）；B0–B3 已完成，下一步：用户确认后进入 B4（课文详情页）**；正式软件接入、真机/系统减少动画/屏幕阅读器验证仍未做，仅在用户明确要求时进行。

## 当前版本与进度

- 软件版本：**0.3.9（versionCode 13，2026-11-20 发布，GitHub 最新 Release v0.3.9）**：新版视觉 B0–B3（令牌/字体/全局组件/首页数据岛），课文详情、练习、闪卡等仍为旧视觉；已推送 main（提交 59e7160），APK 53,898,910 字节，SHA-256 73f43988daeee83d81aa14c9732d26b9f05df70a11ba993fdf13accd49360a39，签名与 0.3.8 相同；构建已暂时排除 `resources/ASSETS/v2/illustrations`（B10 再做白名单）；**未做 0.3.9 的 Android 模拟器/实体机覆盖安装验收**。此前版本：0.3.8（versionCode 12）已推送 main 并发布 Release v0.3.8。发布源码提交：95f307f8c580d1b07e1b813462f88e3b332c51b3。本地预览 http://127.0.0.1:4173/ 。
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

## 新版设计规范与插画（预览阶段，已确认，未接入正式软件）

- **新旧关系**：`新版设计规范/` 完全替代旧版视觉规范（根目录 `DESIGN.md` 已加替代说明）；功能、课程内容、数据逻辑、验证标准仍按原有要求。仅手机竖屏，无桌面/平板独立设计。
- 文档（最终版，第 08 阶段整合）：`新版设计规范/`（`DESIGN.md` 品牌与全部色值、`UI_SYSTEM.md` 字体组件页面动效适配、`ILLUSTRATION.md`、`PRODUCT.md`、`IMPLEMENTATION_PLAN.md` 批次范围与必读、**`UI_MIGRATION.md` 迁移清单与批次步骤/验收**、`DESIGN_STATUS.md` 确认状态与待确认）。预览：`新版设计规范/预览原型/`（首页、课文）、`新版设计规范/插画样稿/illustrations.html`（插画与教学图解样稿，仅手机宽度、离线）。**本阶段只做规范与预览，未改正式软件代码、课程资源与旧插画。**
- 最终插画资源 19 张（14 独立插画 + 5 动画分层素材，用户提供/重做，不重绘）：`resources/ASSETS/v2/illustrations/final/`，清单 `MANIFEST.md`；未处理原图 `final/source/`；处理脚本 `v2/illustrations/tools/finalize_pack.py`（仅去底/清边/统一画布，不调色）。旧资源 `resources/ASSETS/illustrations/` 与 `v2/illustrations/business/`（重配色试验，作废）保留。
- 使用场景：离线资源读取/初始化/实际加载失败→14；通用空态→08；搜索无结果、暂无统计数据→09；离线资源就绪→10；备份及恢复成功→11；里程碑→12（矢量+动画）；鼓励→13；业务六图→02–07；品牌展示→01。普通无网络、普通答对、SQL 返回 0 行不配插画。首页进度岛仍用可按进度点亮的 SVG（12 块，`floor(12×已学完/总数)`）。
- 里程碑矢量素材：`resources/ASSETS/v2/illustrations/milestone/`（`milestone.svg`、`test.html`、`README.md`）。元素 `#island`/`#contours`/`#tile-1…12`/`#flag`；4×3，后排→前排、行内左→右依次亮起一次（28ms 间隔），随后旗子升起，整体约 600ms，播放一次保持最终状态；系统“减少动画”直接显示最终状态。
- **08 阶段整合结果**：消除的冲突与更正见 `DESIGN_STATUS.md` §1“最终版整合”“构建事实更正”两行。要点：情感层 = 14 张位图 + 首页进度岛 SVG + 里程碑矢量；业务六图试验与 `v2/illustrations/business/` 作废；`scripts/build.mjs` 过滤 `.svg`/`.md` 且整目录打包，导致 `milestone.svg` 不进包、`final/source`（≈28MB）会进包，B10 须先改白名单。新增待确认 #17–#24（见 DESIGN_STATUS §2）。本阶段只改文档，未改正式代码、课程资源与插画；未运行构建/测试（文档变更）。
- **尚未完成（留到后续开发/测试阶段）**：正式软件接入（`src/app.js` 等处插画替换、里程碑矢量版与动画、首页进度岛）；真机/WebView 验证；系统“减少动画”真实开关验证；屏幕阅读器验证；系统字体 1.3 倍。详见 `新版设计规范/ILLUSTRATION.md` §15 与 `DESIGN_STATUS.md` §2.1。接入属 `IMPLEMENTATION_PLAN.md` 的 B10，须排在代码批之后，且仅在用户明确要求时进行。

## 第 09 阶段进度（视觉改造，分批 B0–B11）

- **B0 准备与基线：已完成（2026-11-20）**，无界面变化，版本仍 0.3.8，未提交/推送/发布。
- 实际文件：新增：`resources/ASSETS/fonts/`（IBMPlexSans-Regular/SemiBold.subset.woff2、JetBrainsMono-Regular/SemiBold.subset.woff2、两份 OFL 许可文本、README.txt）、`scripts/check-design-contrast.mjs`、`artifacts/design-v2-baseline/`（build.log、test.log、home/lesson/practice/cards/mine × 320/390 截图 10 张）；修改：`.claude/launch.json`（新增 app-preview 预览配置）。未改 `src/`、课程资源、旧插画、`scripts/build.mjs`。
- 验证（实际执行）：改动前基线 `npm run build` 通过（946 文件）、`npm test` 28/28 通过；加入字体后重新构建通过（953 文件，字体与许可随 `resources/ASSETS` 复制进 dist/assets/fonts，尚未被样式引用）、`npm test` 28/28 通过。`node scripts/check-design-contrast.mjs` 对 DESIGN §4 令牌 34/34 通过。基线截图 5 页 × 320/390 均无整页横向溢出、无页面错误。字体合计 63,744 字节（目标约 0.4MB，实为拉丁子集故更小）。未运行 `check-*.mjs` 版式脚本（B0 无界面/CSS 变更，已由截图基线覆盖）。
- 备注：①字体取自本机 TeX Live 的 OFL 文件（IBM Plex Sans 3.004、JetBrains Mono 2.305），未联网下载；②对比脚本额外发现规范未声明的两组：sun-ink `#6B4A12`/日光黄 = 4.4967（略低于 4.5，黄底文字请避免正文级使用或微调）、`--ctl`/浪沫背景 = 2.78（规范只声明白底 3.02，控件须置于白底），已作为参考输出、不计失败，B1/B2 留意；③待确认 #23 已解决字体部分（无需额外压缩），14 张 PNG 压缩仍待 B10 前确认。
- B2 补充（2026-11-20，用户要求）：设置页“正文字号”由 15/17 两档按钮改为与“代码字号”同款的滑块，范围 14–20 px、步长 1、默认 15，拖动即时预览并保存（旧值 17 兼容）；规范原定“两档”已按用户指示调整，范围 14–20 为我取的默认值，可再改。验证：滑到 19 保存、刷新保持、无溢出、28 项测试通过。
- **B3 首页与数据岛：已完成（2026-11-20）**，版本仍 0.3.8，未提交/推送/发布。
- B3 实际文件：新增 `src/island.js`（`islandLitCount`、`islandSvg`）、`src/decor.js`（等深线、潮线）、`tests/island.test.mjs`（点亮数 0/1/6/7/23/79/80、总数 0、越界、NaN 及 SVG 块数/顺序/装饰属性）；修改 `src/app.js`（首页主卡：等深线 + 数据岛 + 已学 N/总数进度条，沿用连续学习、用时、继续/开始学习、待复习按钮；学习路线前加潮线；阶段由 2 列卡片改为紧凑行列表，仍为 `homeStage` 操作；移除 `state_home_learning` 引用，文件保留）、`src/style.css`（B3 样式块；<360 岛缩至 112 并上移、文本区 ≤70%）；截图 `artifacts/design-v2-b3/`。未改快捷入口、统计、业务实战卡的功能与数据。
- B3 验证（实际执行）：`npm run build` 通过；`npm test` 30/30（新增 2 项）；对比度 34/34；`check-teaching-layout/complete-code/structured-lessons/ui-upgrade/erd` 通过；`check-flows/page-refinement/inline-practice/code-layout/detail-refinement` 仍与基线同一失败（报错逐行相同）。首页 320/390 无整页横向溢出、无页面错误，岛为装饰（aria-hidden），进度以文字“已学 N/总数”呈现，当前数据 0/80 → 0 块亮。
- B3 未验证/遗留：①非 0 进度下首页岛亮块数只由单元测试覆盖，未在浏览器里造学习进度截图；②首页“业务实战”仍用旧业务插画、快捷入口仍用旧功能图标（B8/B10）；③课程路线“章节行”紧凑列表在学习页（B6），首页只做阶段行；④规范说主卡有“继续学习”白底标签与“第N章·第N节”副标，现为沿用既有“连续学习/用时”徽章，未新增字段，如需按预览原型改请告知。
- **下一批 B4（课文详情页）**：开工前须先向用户确认待确认项 #2（分步执行默认展开）、#3（调试模式入口）、#12（课文页是否显示底部导航）；必读 `UI_SYSTEM.md` §5、§6.3，`DESIGN.md` §4，`PRODUCT.md` §3，`resources/CONTENT/courses_resource/structured/README.md`，及 `UI_MIGRATION.md` §7（B4）、§8。
- **B2 全局组件：已完成（2026-11-20）**，版本仍 0.3.8，未提交/推送/发布。已确认 #24（进入 ease-out/退出 ease-in，展开 ease-in-out）、#9（设置页“显示”分组）、4 处 confirm 换新版弹窗。
- B2 实际文件：修改 `src/style.css`（顶栏 56 高、滚动后出现描边、详情页居中标题；导航 56×30 胶囊与阴影、文字 11.5；按钮：次按钮=`.outline/.tonal`（白底 ctl 描边主色字）、新增 `.danger/.text-button`、禁用 40%；标签全圆角高 24；卡片内边距 16；新增 `.status-icon` 三态；details/summary 整行可点+旋转箭头+200ms 高度动画；遮罩/底部面板/弹窗样式；`prefers-reduced-motion` 取消过渡；`--body-fs` 正文字号令牌）；`src/app.js`（新增 `confirmDialog`、`openSheet`、`closeTopLayer`；Esc 与原生返回键 `onNativeBack` 先关最上层浮层；4 处 `confirm()` 改为异步 `confirmDialog`；`shell` 详情页加 `detail` 类与右侧占位；设置页新增“显示”分组与 `bodyFont` 操作；`applyBodyFont`）；`src/store.js`（`settings.bodyFont` 默认 15，旧备份经合并默认值兼容）；`scripts/check-page-refinement.mjs`（展开后等待可见，因新增 200ms 动画，仅此一行）；新增预览 `新版设计规范/预览原型/sheet-dialog.html`、截图 `artifacts/design-v2-b2/`。
- B2 验证（实际执行）：`npm run build` 通过（953 文件）；`npm test` 28/28；`check-design-contrast` 34/34；`check-teaching-layout/complete-code/structured-lessons/ui-upgrade/erd` 通过；`check-flows/inline-practice/code-layout/detail-refinement/page-refinement` 仍为 B1 前已存在的同一失败（报错与基线相同；page-refinement 在加等待后回到基线失败点）。浏览器实测：弹窗点遮罩不关闭、Esc 与 `onNativeBack` 取消、点确认才执行（以 deleteCard 模拟）；正文字号 17 保存后刷新仍为 17；设置页/首页/课文在 320 与 390 及系统字体 1.3 倍（html 20.8px 模拟）无整页横向溢出、无页面错误。
- B2 未验证/遗留：①`openSheet`（底部面板）与 `.status-icon` 已建好但现有页面没有调用点，未在正式应用内实测，仅在预览页验证，接入留 B3/B6；②设置页开关控件本身高 26（外层整行 ≥45 可点），未单独改；③`.tonal` 与 `.outline` 现统一为次按钮样式；④`confirmDialog` 的“关闭查询标签/覆盖恢复/删除个人数据库”三处未逐一走真实页面流程，只用同一函数的 deleteCard 路径验证；⑤真机/WebView 的返回键与系统字体缩放未验证。
- **下一批 B3（首页与数据岛）**：必读 `DESIGN.md` §3.3、§5，`UI_SYSTEM.md` §6.1–§6.2，`ILLUSTRATION.md` §1，及 `UI_MIGRATION.md` §5.1、§7（B3）、§8；无相关待确认项；参考 `预览原型/home.html`。
- **B1 令牌与基础样式：已完成（2026-11-20）**，视觉为新版令牌，版本仍 0.3.8，未提交/推送/发布。
- B1 实际文件：修改 `src/style.css`（新增 4 个 `@font-face`；`:root` 换为新版令牌并新增 `--teal --sun --sun-ink --sun-bg --lake --card --sand --ctl --primary-press --ok/--warn/--err(+bg)`、字体栈/字阶/间距/圆角/导航阴影令牌；旧令牌名保留为别名；硬编码旧色 25 处按用途换为令牌；等宽字体栈改 JetBrains Mono、代码 14/1.55；`--page-inset` 18→16，断点 350→359 时为 12；`.page` max-width 600→480）。新增 `artifacts/design-v2-b1/`（5 页 × 320/390 截图）、`artifacts/design-v2-baseline/b1-*.log` 与 `base-*.log`（脚本输出）。未改 `src/*.js`、课程资源、旧插画。
- B1 验证（实际执行）：`npm run build` 通过（953 文件）；`npm test` 28/28；`check-design-contrast` 34/34；`check-teaching-layout`、`check-complete-code`、`check-structured-lessons`、`check-ui-upgrade`、`check-erd` 通过；浏览器内 IBM Plex Sans 400/600 已加载、无 4xx 请求、`--page-inset` 16；5 页 × 320/390 无整页横向溢出、无页面错误。**未通过但为原有失败**：`check-flows`、`check-page-refinement`、`check-inline-practice`、`check-code-layout`、`check-detail-refinement` 5 个脚本——换回原 `style.css` 重跑，报错与改动后逐行相同（断言与 0.3.8 课程/页面内容不一致，如找不到 `option C`、示例 SQL 文本、栏目顺序），故非 B1 引入，未修改这些脚本，需后续单独决定是否修正。JetBrains Mono 仅在出现代码时懒加载，已确认首页不加载；代码页字体加载未专项验证。
- B1 遗留（留到对应批次，不算 B1 完成项）：编辑器块 `--editor-fg/-string/-number` 等及深色编辑器色仍为旧值，属 B7；全站按组件的字号/圆角/内边距逐处套用 6 级字阶与圆角规格，属 B2–B6 随组件改造（B1 只建立令牌并改基础元素）；`h1/h2/h3/p` 基础字号字重未按 6 级重写，留给各页面批以免破坏现有版式断言。grep 旧色值仅剩上述编辑器块。
- 用户已提供第一批课文目录 `/Users/caiying/Downloads/数屿 SQL 第一批正式课文（7节）/`（“第一批要改的课文内容”），本阶段未使用，后续课程任务需要时再读。
- **下一批 B2 必读**：开工前须先向用户确认待确认项 #24（动效缓动）和 #9（设置页“正文字号”入口位置）；必读 `UI_SYSTEM.md` §2–§4、§7、`DESIGN.md` §3，及 `UI_MIGRATION.md` §7（B2）、§8；B2 另需先做底部面板/弹窗预览（`IMPLEMENTATION_PLAN.md` §4）并由用户确认。
- （以下为 B0 时的旧记录）**B1 必读**：`AGENTS.md`、本文件、`新版设计规范/DESIGN_STATUS.md`、`UI_MIGRATION.md` §7（B1 行）与 §8、`新版设计规范/DESIGN.md`、`UI_SYSTEM.md` §1–§3；B1 在 `@font-face` 中引用 `resources/ASSETS/fonts/` 并替换 `src/style.css` 令牌。B1 无相关待确认项。

## 未解决项与下一步

1. 等待其余 73 节的外部课程资源。收到后只导入新批次指定字段；按原始编号和既定合并映射保留关联及历史。
2. 将新原包和导入快照归档并登记批次，按语义转换尚未完成的课程；不要重跑第一批转换。使用统一块结构，不另写课程页面组件。
3. 为新批次追加独立的源码/夹具/中间结果验证，不改变第一批已完成记录。
4. 每批导入后更新本文的版本、编号、文件用途、真实验证结果和待处理项。刷新资源哈希并构建。
5. 0.3.8 已发布为 GitHub 最新版本：https://github.com/chungcy00/SQLIsland/releases/tag/v0.3.8 。APK 与 update.json 均已上传；APK SHA-256：77a801a9d7662e3d35c422b9411f191a70326a2efe827650f57d4ded78a20af2。用户可从应用“我的 → 版本更新”检查新版。后续仅在用户要求时另行发布。
6. 新版设计规范与插画：规范已整合为最终版，正式接入待用户指示。续作前依次读：`AGENTS.md`、本文件、`新版设计规范/DESIGN_STATUS.md`、`新版设计规范/UI_MIGRATION.md`（对应批次 §7、待确认 §8）、`IMPLEMENTATION_PLAN.md` §3 列出的该批必读文档；执行顺序 B0 → B1 → B2 → B3–B7（按序）→ B8/B9/B10 → B11；不重复讨论已确认设计，待确认项先问用户。
