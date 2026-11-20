# 迁移核对页与 D26 门禁（M2-03b / M2-04 / M2-04b）

迁移核对页（`/#/migration`）只读，只显示命令行生成并保存的报告。判定优先级：**差异 > 阻断 > 待确认 > 通过**。

```mermaid
flowchart TD
  Imp[legacy-import 导入] --> Scope{范围含 AP/AR 控制科目?}
  Scope -- 是 --> File{提供期初明细文件?}
  File -- 否 --> Fail[INVALID_INPUT，不建库]
  File -- 是 --> Rec[导入内自动核对并保存报告]
  Scope -- 否 --> Rec
  Rec --> Diff{有真实差异?}
  Diff -- 是 --> D[差异：不能确认]
  Diff -- 否 --> Gate{期初门禁适用且缺 opening=done?}
  Gate -- 是 --> B[期初阻断]
  Gate -- 否 --> Known{有未确认的已知差异?}
  Known -- 是 --> P[待确认]
  Known -- 否 --> Ok[通过：仅此项核对通过]
  P --> Conf[legacy-reconcile --confirm 更新报告]
  Rec --> Page[迁移核对页 只读：读已保存报告]
```

- 判定顺序（`reconcile.ts`）：真实差异 > 适用的期初门禁 > 未确认的已知差异 > 通过。不含 AP/AR 控制科目时门禁不适用。`legacy-reconcile --check` 只读、不保存报告；页面读的是导入自动保存或 `--confirm` 后更新的报告。
- T = 贸易 GL，S = 子账，P = 期初未结项原始金额，G = 全部 GL。M2-04 首批的 T−S、G−T 只作展示，不作判定。
- 子账通过不等于演练放行；演练（M2-05）和切换（M2-06）尚未开始，另需用户授权。
- 期初未结项可核销、可用预付 / 预收应用，**不能**开贷项或取消（D30）。
