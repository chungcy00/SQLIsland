# 数屿SQL

安卓手机 SQL 离线学习应用，最低 Android 10，目标 Android 16。

## 运行

- 从[最新Release](https://github.com/chungcy00/SQLIsland/releases/latest)下载安装APK。
- 本地开发预览运行 `npm install`、`npm run build`、`npm run preview`，访问 http://127.0.0.1:4173。
- 源码位于 `src`，安卓容器位于 `android`。

课程、题库、闪卡、SQL 引擎与七套数据库全部随 APK 打包。用户记录保存于应用本地，备份通过安卓系统文件选择器导出。

## 内容与界面

当前构建资源位于 `resources/CONTENT`，图像资源位于 `resources/ASSETS`。原始交付快照随0.3.0 Release提供，用于审计追溯。当前正式资源为 20 章、80 节知识点、200 道练习、200 张闪卡和七套数据库。页面按用户要求精简文案。SQL 统一在展示时排版，编辑器提供格式化操作。用户草稿由用户主动格式化。

## 构建 APK

执行 `npm run build` 后运行 `sh scripts/build-apk.sh`。脚本使用 `.tooling` 下的 JDK 17 与 Android SDK，也可通过 `JAVA_HOME` 和 `ANDROID_SDK_ROOT` 指定环境。需要 Android Platform 36、Build Tools 35.0.0。

本地安装包使用 `.tooling/sql-shouji.keystore` 签名。保留此文件才能安装覆盖更新。

## 验证与当前范围

- 企业资源4.2.0已完成逐表审计，保留全部学习编号与300题、200卡。七库来自统一企业模型，共享表逐值一致。
- SQLite WASM 执行了 775 组参考解夹具，格式化后的 SQL 仍通过结果或状态比对。
- 浏览器检查覆盖 33 个页面入口、五种题型及 320/360/390/430 像素宽度。
- Android 16（API 36）模拟器验证了正式签名 APK 飞行模式冷启动、课程查询、学习记录、选择题、SQL 判题、闪卡调度与实验室查询。
- 当前正式题库的 q0212 已支持 RANGE 累计结构判定，覆盖标准解、子查询等价解和命名窗口。q0240 属于精简前历史题。
- MySQL 8.4 原生引擎与实体手机尚未验收，Android 10 设备尚未实测。本地教学采用 SQLite 兼容执行。
- 本版支持现有学习和练习流程、个人卡片、个人数据库导入、备份恢复。完整需求中的综合测试会话、掌握度权重、数据导入字段类型配置等尚未实现。有效前台学习时长从 0.2.0 版本起记录。

## 检查命令

- `npm test`
- `node scripts/check-flows.mjs`
- `node scripts/check-copy.mjs`

后两项需要先启动本地预览，使用本机 Chrome 无头检查。验证结果位于 `artifacts`。

## 0.2.0 界面与更新

- 首页主卡按确认的参考图恢复学习插画，插画已放大。
- 学习路线支持阶段筛选和章节展开。
- 编辑器支持行号、高亮、撤销重做、自动缩进和配对、格式化、全屏，以及系统键盘/SQL 键盘切换。
- 实验室支持独立的查询标签与草稿保存，旧实验室草稿会接入第一个查询标签。
- 闪卡可撤回上次评分，恢复之前的 FSRS 状态。
- 更新源为 `chungcy00/SQLIsland` 的 GitHub Releases。只有点击检查更新才发起联网请求。学习、练习和 SQL 执行继续使用安装包内置资源。
- `release.json` 维护本版说明。签名 APK 构建后执行 `node scripts/prepare-update.mjs` 生成 `artifacts/update.json`。公开 Release 标签与版本号一致，当前为 `v0.5.0`，同时附加 APK 与更新清单。
- 应用先核对 SHA-256、包名、递增版本号和签名，再调用安卓安装器。首次安装更新需在安卓设置中允许安装应用。
- 已发布至 https://github.com/chungcy00/SQLIsland/releases 。已在 Android 16 模拟器完成真实版本检查、下载校验与安卓系统覆盖安装。实体手机仍待验收。

## 更名兼容

0.2.1 更名为“数屿SQL”。包名、WebView 本地来源、签名及备份格式标识继续沿用，旧记录与旧版备份可继续使用。GitHub 下载文件使用 ASCII 名称 `ShuyuSQL-0.2.1.apk`。

后续发布时同步递增 `release.json`、`android/app/src/main/AndroidManifest.xml`、`android/app/build.gradle` 及构建脚本中的版本号与文件名。使用现有 `.tooling/sql-shouji.keystore` 签名，运行构建和清单生成后，将 APK 与 `update.json` 一起附加到新的 GitHub Release。清单里的 APK 名使用 ASCII 文件名。

本地预览通过开发服务器读取 GitHub 更新信息。安卓安装版由原生更新模块直接检查与下载。已验证从公开 0.2.0 更新至更名后的 0.2.1，学习记录保持完整。

## 0.3.3 桌面图标

安卓桌面图标采用岛屿学习主题插画。

## 0.3.2 企业实战逐题复审

题目资源升级至4.2.1。50题按当前七库重新核对，完成33题A类、9题B类、1题C类、5题D类和2题E类处理。B类包括随包阅读版参考代码的修复，逐题清单明确区分正式答案与导出答案的修改范围。

237个公开及隐藏场景经独立原始事实计算、原生SQLite及sql.js WASM交叉验证。参考解和等价解各引擎执行474次，WASM逐题拒绝100条典型错误与公开结果硬编码。七库完整性、主外键和共享事实核对通过，300题、200卡及稳定知识点关联均已检查。

[逐题审核报告](artifacts/task-reaudit-20261118/逐题审核报告.md)与[逐字修改前后清单](artifacts/task-reaudit-20261118/tasks.json)包含每题分类、口径、代码、场景及执行证据。

重跑本轮审核需保留`.tooling/task-reaudit-20261118`中的审核前快照，依次运行`python3 scripts/task_reaudit/run.py`、`python3 scripts/task_reaudit/exports.py`、整数列策略生成、构建、自动测试及WASM检查，再执行`finalize.py`与`report.py`。原生MySQL8.4仍待验证。

## 0.3.1 判题修复

[下载最新版](https://github.com/chungcy00/SQLIsland/releases/latest)。应用内打开“我的 → 版本更新”即可获取。

整数输出列按公开及隐藏夹具的原始类型精确比较。246道题接入整数列策略，216条小数偏移错误查询全部拒绝。派生小数指标保留原有容差，13项自动测试及775次参考执行通过。详情见[判题复验记录](artifacts/enterprise-audit/0.3.1判题修复.md)。

Android 16模拟器已从公开0.3.0下载并覆盖安装0.3.1，安装文件哈希与Release一致，新建回归记录的九类状态保留通过。断网查询与七库ERD全部加载通过。

修改夹具后执行`python3 scripts/generate-integer-policy.py`，随后重新构建并运行`node scripts/check-integer-policy.mjs`及全量测试。

## 0.3.0 企业审计与 ERD

- [下载安装包与更新清单](https://github.com/chungcy00/SQLIsland/releases/tag/v0.3.0)。在“我的 → 版本更新”检查即可获取新版。
- 资源升级至4.2.0，七库45张业务表完成逐表复查，促销改为非固定频次、可跨月跨年及重叠的活动。
- 50道企业题通过204套独立场景核对，408次WASM参考与等价执行通过，290个错误变异及50组公开结果硬编码被拒绝。
- 数据表内新增真实元数据生成的ERD，字段全部展示，支持手机拖动缩放、搜索、全屏、关联聚焦与预览。
- 七库字典随包提供，个人SQLite库使用同一组件，实际外键与视图依赖分开显示。
- SQL键盘可拖动调高并记忆。表预览一次展开一张，练习大标题使用简短标题。

[企业审核报告](artifacts/enterprise-audit/审核报告.md)、[逐表复查](artifacts/enterprise-audit/逐表复查.md)、[ERD验证报告](artifacts/enterprise-audit/ERD验证报告.md)包含数据分布、业务口径、判题、资源同步和性能证据。

原生MySQL8.4与实体Android10/16仍待验收。模拟器曾出现IndexedDB文件损坏，历史记录保留项未通过，故障发生时间未确认。同源浏览器从0.2.1升级至0.3.0的完成状态、笔记、收藏、草稿等九类状态检查通过。

### 从源码构建

```sh
npm ci
npm run build
npm run preview
```

构建完整APK还需JDK17、Android Platform36、Build Tools35.0.0和原签名密钥。密钥单独保存在本机，发布源码不会包含密钥。

### 重跑企业审计

普通构建直接使用仓库中的审计资源。重跑修复程序需要先从0.3.0 Release下载`audit-baseline.tar.gz`，校验其SHA-256后解压原始CONTENT。

```sh
mkdir -p .tooling/audit-original
gh release download v0.3.0 --repo chungcy00/SQLIsland --pattern audit-baseline.tar.gz --dir .tooling
tar -xzf .tooling/audit-baseline.tar.gz -C .tooling/audit-original CONTENT
```

审计程序默认读取`.tooling/audit-original/CONTENT`，也可用`SQL_AUDIT_ORIGINAL`指定原始快照。固定种子、命令顺序和验证限制见`resources/CONTENT/DEVELOPMENT_AUDIT.md`。中期促销分布聚合证据保存在`promotion-review.json`，用于复查追溯。

ERD检查运行`node scripts/check-erd.mjs`，需要本机Chrome与预览服务。历史浏览器迁移检查还需准备`.tooling/audit-migration-source/dist`中的0.2.1构建。

## 0.3.8 课程资源与统一教学展示

80 节课程均已导入并完成独立结构化转换，原始资源包留存校验。完整代码、运行按钮、预期结果和扩展示例采用统一顺序。开发续作请先读取 [HANDOFF.md](HANDOFF.md)。
