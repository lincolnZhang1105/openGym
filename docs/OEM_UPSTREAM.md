# OEM 版本与上游正式版同步

## 当前基线

本 Fork 的 OEM 开发从正式发布的 `v1.4.4` 开始，精确提交见
[`oem/upstream.json`](../oem/upstream.json)。版本号或标签名称相同不代表提交一定相同；
后续同步应同时核对标签和提交 SHA，不强制覆盖已存在的上游标签。

| 分支 | 用途 |
| --- | --- |
| `upstream-release` | 最近已接入的正式版原始提交，不提交 OEM 修改 |
| `oem/develop` | 正式版基线 + 本地构建修复 + 后续 OEM 开发 |
| `feature/oem-*` | 从 `oem/develop` 派生的单项功能分支 |
| `sync/upstream-*` | 从 `oem/develop` 派生的上游版本合并、适配和测试分支 |

已有 `main` 和 `develop` 保留此前历史。开发时使用 `oem/develop`。
`origin` 指向 lincolnZhang1105/openGym；`upstream` 指向 DuarteSantos8/openGym。

截至本次检查，最新非预发布版本是 v1.4.4；上游 `release-1.4.4` 与该标签指向同一提交，
而 `release-1.4.5` 是下一版开发分支。今后以 GitHub 正式 Release 的标签和已核对的 SHA
为依据，不仅凭分支名称判断。正式版也可能有缺陷；安全修复必要时单独回移并测试。

当前仅建立发布基线、保留已验证的 Android/Windows 构建修复并定义同步约定。
尚未实现 OEM 插件接口、自动同步工作流或 OEM 专属应用标识；本文件中的扩展目录和
接口是后续开发约定，不是现有能力。

## 接入下一正式版

1. 查看上游最新 Release 的 `tag_name`、`draft`、`prerelease` 和变更说明；确认目标是
   正式发布。检查相关安全修复、依赖变化、数据迁移和原生插件变化。
2. 确保工作区干净，获取上游提交和标签。在 `oem/develop` 上创建独立同步分支。
3. 将正式标签解析成完整提交 SHA，核对它包含此前已接入的基线。若不是祖先关系，或
   旧标签被移动，先人工分析历史，不能自动覆盖 OEM 分支。
4. 用 Git merge 合并目标 SHA。保留 OEM 提交的历史；冲突逐处处理，不批量采用上游
   文件覆盖自定义功能。
5. 更新 `oem/upstream.json`，记录本次目标标签和 SHA。完成下述验证并提交后，向
   本 Fork 的 `oem/develop` 创建 PR。验收通过后合并，再发布自己的 APK。
6. 合并验收完成后，将 `upstream-release` 快进到本次上游 SHA，不合入 OEM 提交。

以下 PowerShell 命令是操作模板，`vX.Y.Z` 必须替换成经过确认的真实正式标签：

```powershell
git fetch upstream --tags
git switch oem/develop
git pull --ff-only origin oem/develop
git switch -c sync/upstream-vX.Y.Z
$baseline = Get-Content oem/upstream.json -Raw | ConvertFrom-Json
$targetCommit = git rev-parse 'vX.Y.Z^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'Target tag does not resolve' }
git merge-base --is-ancestor $baseline.commit $targetCommit
if ($LASTEXITCODE -ne 0) { throw 'Upstream history requires manual review' }
git merge --no-ff --no-commit $targetCommit
# 检查合并结果；解决冲突；更新基线记录；运行测试；再提交并推送。
# 决定取消本次未完成的合并时，可以执行 git merge --abort。
```

未来可以自动创建同步分支和 PR，但不要自动合并或直接发布。Git 合并成功仅表示
文本层面没有冲突，不表示 OEM 行为、原生桥接或历史数据一定兼容。

## OEM 扩展约定（待具体需求确定后实施）

- **品牌与配置**：集中管理应用名、图标、主题、默认设置、包名、版本和更新仓库。
  原生资源和 Capacitor 配置需同步处理；包名一旦投入使用应保持稳定，改包名需要迁移数据。
- **功能隔离**：新增页面和组件优先放入 `frontend/src/oem/`，用少量明确的页面入口、
  组件插槽和事件调用接入。避免将同一功能分散修改到大量上游文件。
- **适配层**：OEM 代码通过自有适配层访问训练记录、设置和原生能力，升级上游时优先
  修改适配层。上游内部函数没有稳定兼容承诺，不能直接视为插件 API。
- **数据契约**：OEM 字段使用独立命名空间和 schemaVersion，通过显式迁移处理升级。
  逐项确认持久化、导入导出、备份恢复、服务端校验和冲突合并都保留这些字段；不能
  仅向 Zustand store 增加字段就假定同步已支持。
- **可关闭和可验证**：OEM 功能可以关闭，关闭时保留已保存的数据。训练规则、事件
  和数据迁移配测试，确保升级后不会重复记组、丢失记录或错误改变加重规则。

上游 `modules.js` 目前是内置功能开关，不提供第三方插件加载或兼容性保证。
主题配置通常适配成本较低；训练状态机、数据模型及 Android/iOS 原生能力的改动
需要更多回归验证。具体插槽和事件接口在首个实际 OEM 功能确定后设计。

## 每次升级的验证与发布

- 运行上游要求的前端/API 检查及 OEM 契约、迁移测试；新增 UI 文案遵守上游语言检查。
- 重新生成手机前端和媒体，执行 Capacitor sync、手机包完整性检查、Android Release
  构建及 JVM 单元测试，避免把旧的 dist 资源打进新 APK。
- 用匿名测试备份验证旧版数据升级、导入导出与恢复；用设备验证开始训练、记组、休息
  计时、完成训练和 OEM 功能。代码回滚不等于数据迁移可回滚，应事先保留备份和旧包。
- 自己的 APK 使用持续保管的签名证书，以及单调递增的 versionCode。上游版本号和
  OEM 发布序号分别记录；不直接照搬可能比已安装版本更低的上游 versionCode。
- App 更新入口应指向本 Fork 的正式发布，且只提供已经合并验收的 OEM APK。上游源码
  同步与手机自动更新是两个流程；目前 App 的更新地址仍是原作者仓库，尚待 OEM 配置化。
- 私钥、密码、用户训练记录和私人 API Key 不提交到仓库。商用前仍需遵守 AGPL，并
  单独处理动作图片和动画的许可，见 `NOTICE.md`。

此前生成的 `dist-apk` 安装包仍是旧构建。本次建立分支不会自动替换该 APK。
