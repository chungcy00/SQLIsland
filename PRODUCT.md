# 数屿SQL

<!-- impeccable:product-schema 1 -->

## Platform

android

## Purpose

可安装在安卓手机的中文 SQL 离线学习软件。课程、练习、闪卡和数据库随 APK 打包。

## Evidence on Hand

参考资料位于 /Users/caiying/Downloads/sql_final_delivery。已核验 20 章、152 知识点、300 题、200 闪卡和七库的原始完整性。保留内容 ID。

## Implementation decisions

用户已确认名称为 数屿SQL、最低 Android 10，使用设备为 Android 16。Java 原生容器配本地 WebView UI，SQLite WASM Worker 执行，IndexedDB 事务保存用户记录。采用现有海盐蓝手机设计及 PNG 素材。资料中的 PWA/iOS 建议由本次安卓 APK 目标取代。

## Confirmed UI and update reference

用户确认参照 AI Studio 的界面组织方式，首页学习插画放在主卡右侧并放大。学习路线采用阶段筛选与章节展开，编辑器增加高亮、行号、撤销重做、全屏和底部 SQL 键盘，实验室支持查询标签。软件名为数屿SQL。更新流程借鉴日迹，经用户批准在 chungcy00/SQLIsland 发布 APK 与清单，通过安卓系统覆盖更新。
