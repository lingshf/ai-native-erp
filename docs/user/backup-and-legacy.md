# 备份与旧账工具

备份、快照和导入都是**命令行**能力，目前没有对应界面（只读旧账报表除外）。

## 备份与恢复（M0-R5）

```powershell
npm run storage:admin -- backup <db> <out>
npm run storage:admin -- restore <db> <in>   # 先停止服务
```

备份使用 SQLite 在线备份并校验；输出已存在、与目标同名或为保留路径时拒绝。恢复需离线，替换前自动生成带时间戳的完整 `.bak`，失败则校验回滚。不要手动删除 WAL/SHM/journal 文件。

## 旧账快照（M2-01）

```powershell
npm run storage:admin -- legacy-snapshot --source-dir <已停写的隔离源目录> --out-dir <不存在的新目录>
```

仅 Windows；两个路径必填，无默认值；源目录须已停止并隔离（独占句柄，冲突则 `SOURCE_BUSY`），残留 `-journal` 则拒绝。**对真实旧账的操作须另行取得授权**，开发和 CI 只用虚构夹具。生成的快照与备份不得提交到 Git。详见 [legacy-snapshot.md](../legacy-snapshot.md)。

## 导入映射与 dry-run（M2-02）

仅有库代码与测试，**没有命令行或界面入口**；不打开或写入任何目标库。决定 C（草稿、回执、来源事件、队列、封印、审计的处理）无默认值。

## 旧账导入（M2-03，v0.2.0 新增，命令行）

```powershell
npm run storage:admin -- legacy-import --snapshot-dir <已校验快照> --target <不存在的新目标路径> `
  --drafts import-as-draft --receipts archive-only --source-events archive-only `
  --transfer-queue archive-only --seals archive-only --audit archive-only
```

- 只接受已生成并校验 SHA 的快照、**新**目标路径和全部六项决定（无默认值）；不读取活动旧账、4173 或 `.bak`。上面的选项仅为示例，不代表对真实数据的授权。
- 拒绝合并或覆盖已有业务库；同一工具的未完成导入可用同一命令断点续跑。导入全程持有独占维护锁；硬终止遗留的锁须由操作员确认进程已停止后处理，不会自动删锁。
- 按选项保留或跳过草稿；导入历史凭证（来源显示为 `LEGACY`）及关闭状态；原结转只落账一次，不补造业务回执、不重复生成结转。`archive-only` 的证据留在原只读快照中。
- 完成状态是 `imported`，**不是** `reconciled`：运行时拒绝把未核对的导入库作为活动库打开，核对（M2-04）通过前不能切换。
- 导入的旧账 AP/AR 余额只有凭证，**不会成为未结项**：贸易 GL 核对会把它们列为“其他来源”差额，也不能用付款/收款核销。D25 规定的期初未结项导入（M2-03b）尚未完成。
- 没有界面入口。**迁移尚未完成**：M2-03b、M2-04、M2-04b、M2-05 依次推进；真实迁移演练时，用户需提供期初未结明细文件（旧账没有子账）。真实旧账的任何操作须另行授权。

## 只读旧账报表

导航“只读报表 → 试算平衡表”及 `/api/v1/legacy/*` 读取已验证的旧快照。未配置快照时（上下文接口返回有效 503）页面显示中性的“未配置或暂不可用”，说明不影响当前账套，并链接到“总账报表”，可显式“重新加载快照”；网络、无效响应与实际报表读取失败仍显示错误。运行状态页只请求 health。当前账套的报表请用“总账报表”。

![旧快照未配置](../demo/v0.2.0/screenshots/03-trial-unconfigured.png)


