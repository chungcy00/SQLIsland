# 企业资源4.2.0开发与复验

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
