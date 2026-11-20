# 迁移核对页与 D26 门禁（M2-03b / M2-04 / M2-04b）

迁移核对页（`/#/migration`）只读，只显示命令行生成并保存的报告。判定优先级：**差异 > 阻断 > 待确认 > 通过**。

```mermaid
flowchart TD
  Imp[legacy-import 导入] --> Scope{范围含 AP/AR 控制科目?}
  Scope -- 否 --> NA[期初门禁：不适用]
  Scope -- 是 --> File{提供期初明细文件?}
  File -- 否 --> Fail[INVALID_INPUT，不建库]
  File -- 是 --> Rec[自动核对并保存报告]
  NA --> Rec
  Rec --> Page[迁移核对页 只读]
  Rec --> Open{opening=done?}
  Open -- 否 --> Block[期初阻断]
  Open -- 是 --> Eq{T+P-S 与 G-T-P 均为 0?}
  Eq -- 否 --> Diff[差异：不能确认]
  Eq -- 是 --> Pend[待确认]
  Pend --> Conf[legacy-reconcile --confirm]
  Conf --> Pass[通过：仅此项核对通过]
```

- T = 贸易 GL，S = 子账，P = 期初未结项原始金额，G = 全部 GL。M2-04 首批的 T−S、G−T 只作展示，不作判定。
- 子账通过不等于演练放行；演练（M2-05）和切换（M2-06）尚未开始，另需用户授权。
- 期初未结项可核销、可用预付 / 预收应用，**不能**开贷项或取消（D30）。
