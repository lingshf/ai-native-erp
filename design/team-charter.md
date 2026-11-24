# 团队章程（unified-agile-v1）

- **来源**：决定 D555。用户请求团队迁移，由 Manager2 转达，协调者（Team Leader）派给设计角色起草。基线为 main `3bbab1e`。
- **维护**：本文件由 Team Leader 维护；角色、节奏、权限或流程有变化时更新，受影响的角色确认范围。本稿由 Product/Design 起草，合并前由非作者评审。
- **规则来源**：
  - 操作模型：agile-ai-team 共享操作模型 `unified-agile-v1`。
  - 质量标准：共享质量标准（设计前置、务实的 SOLID 与可读性、动态语言默认类型、负责人与证据对照）。
  - 本文只写本项目的绑定与取舍，不复制上述条文。
- **本仓库已有、继续有效的口径**：
  - 路线图 [§5 团队流程](roadmap.md#5-团队流程)：可读性 ①–⑥、证明附原文、设计文档自查等。
  - [任务书模板](tasks/TEMPLATE.md)。
  - [发布流程](../docs/release/README.md)。
  - 与本章程冲突的，以本章程为准。迁移时已在路线图 §5“角色”一条和任务总表开头的规则处改为引用本章程。

## 1. 角色绑定

| 角色 | 承担者 | 说明 |
| --- | --- | --- |
| Manager2 | 用户的多项目管理者 | 只与 Team Leader 沟通；团队内部协作不经 Manager2 |
| Team Leader | 协调者会话 `2bb903cb` | 协调派发、清障、合并就绪核对、Sprint 记录；不能替产品排序，不能推翻 QA 或评审结论 |
| Product/Design（兼产品负责人） | 设计会话（本文作者） | Product Goal、唯一待办的含义与顺序、验收基线、架构与 UX、性能计划、决定记录；重大价值或范围取舍由用户决定，经 Team Leader 转达 |
| Developer | 每个任务一个 Opus 5.5 会话 | 同时在途最多 3 个；实现、自动化测试、本变更引起的 CI 修复、开发者事实 |
| Code Reviewer + QA | 评审会话 `5ec013bf`（一人兼两角） | 不做作者。对同一确切 head 分别给出**代码评审结论**与**行为验收结论**，不合并成一个。若它本身写了测试、流水线或文档改动，该改动须另找非作者评审 |
| Delivery/Release + Knowledge Lead | 版本管理会话 `d687c768`（一人兼两角） | 负责版本、RC、发布说明、CHANGELOG 与授权范围内的发布操作；兼任知识负责人，负责系统入口与覆盖矩阵。跨模块复杂度上升时拆成独立会话 |

**独立性**：作者的自查、换一次提示词或换模型都不算独立评审。拿不到独立证据时，相应关口保持 `blocked`。

**角色权限**：角色名称本身不带合并、打 tag、发布或部署权限。每项操作都需要单独的授权记录：用户明确授权，或已批准且写明批准人的策略。

## 2. 权威路径

| 内容 | 唯一权威路径 | 维护者 | 独立核对 |
| --- | --- | --- | --- |
| 目标、需求、架构、ADR、UX、决定 | `design/`（[路线图](roadmap.md)、[M0 架构](m0-architecture.md)与 [ADR-LOCAL-001](adr/ADR-LOCAL-001.md)、[产品准则](product-guidelines.md)、[`ui/`](ui/)、各任务书；[需求](requirements.md)只有 FG / OQ 需求与会计政策仍有效，其 ARCH-SME 部分与 [`architecture.md`](architecture.md)、[ADR-SME](adr/ADR-SME-001.md) 一样已被取代，仅作历史参考；决定记录在路线图 §6 与各 Sprint 计划的决定表，全部编号的位置见[决定索引](decisions.md)） | Product/Design | 非作者评审；开发与 QA 核可行性和可测性 |
| **唯一待办** | **[`design/tasks/README.md`](tasks/README.md)**（任务总表），以及它链接的 Sprint 计划 `design/tasks/S*.md` 与任务书 `design/tasks/<ID>-*.md` | Product/Design 负责顺序与含义，并照录执行字段；Team Leader 提供执行证据（§4） | 团队在交接时核对 |
| 验收与测试证据 | [`design/test-cases.md`](test-cases.md) 与 PR 正文中的证据 | QA（评审会话 `5ec013bf`；D560 起已接手 `test-cases.md`） | 非作者评审；Product/Design 确认意图 |
| 系统入口、用户 / 开发 / 运维指南、交接路径 | `docs/README.md`（**尚未建立**，由 Knowledge Lead 新建）及它映射的页面（现有 `docs/user/`、`docs/flows/`、`docs/performance/`、`docs/migration-runbook.md` 等） | Knowledge Lead 负责整合；设计、开发、版本管理提供事实 | 模块负责人核对事实；QA 演练关键步骤；非作者评审 |
| 变更日志、发布说明、Demo 与发布执行记录 | [`CHANGELOG.md`](../CHANGELOG.md)、`docs/release/`、`docs/demo/` | Delivery/Release | 非作者评审核一致性；QA 验产物 |
| 章程、Sprint 记录 | 本文件、`design/tasks/S*.md`、`design/reviews/` | Team Leader（Sprint 计划的任务内容由 Product/Design 撰写；任务的六项事实记在任务总表，见 §4） | 受影响的角色确认 |

关于唯一待办：

- `design/tasks.md` 是更早的实施记录，**不是第二份待办**，不再登记新任务；引用其中的历史结论时用链接。
- Sprint 选择、角色队列、协调者看板都是任务总表的视图，不另建任务表。
- 共享文件（任务总表、Sprint 计划、lockfile、迁移）的修改要串行。

## 3. 完成定义（DoD）

在路线图 §5 现有 DoD（可读性 ①–⑥、证明附原文、数字出现即附证据等）之外，按共享质量标准补齐以下各项。只对改动范围与风险适用的项要求证据：

1. **设计前置**（负责人 Product/Design；派发前由非作者评审核对）。任务书须写清下面三项，适用与否按改动触及的范围与风险判断，不按任务类型一概而论（D557）。具体写法见[任务书模板“设计阶段质量项”](tasks/TEMPLATE.md#设计阶段质量项)。
   - **UI**：主路径、信息层级、沿用现有设计语言、交互状态（空、加载、错误、禁用）、窗口宽度、键盘与焦点、中英文、红绿主题、教学模式。
   - **功能边界**：模块职责、接口与依赖、数据流、读写与状态归属、失败边界。
   - **性能**：关键路径、工作量假设、预算与验证方法。预算未知时标 `to_confirm`，写明负责人，不编造数字。
   - **纯重构**（不改行为）：只有不触及任何页面、也不触及有性能预算的路径时，才可把 UI 与性能标 `not_applicable`，理由写具体的无影响依据。两个例外：
     - **页面拆分**（如 REFAC-33）：UI 项适用，须提供真实渲染与交互证据（焦点、键盘、状态切换），由 QA 核对；输出等价证明不能替代。
     - **触及已有性能预算的路径**（如 bundle-measure 覆盖的体积）：性能项适用，须引用该预算并提交测量（按路线图 §5 R7）。
   - **`to_confirm` 阻断就绪**：实质性的 `to_confirm`（会影响设计取舍的预算或口径）未确认前，受影响的任务不算就绪、不派发；只写负责人不等于就绪。
2. **实现质量**（负责人 Developer；Code Reviewer 对确切修订核对）：
   - SOLID 适度、可读，不为挂名而加接口、工厂或继承层。
   - TypeScript 用原生类型，不留没有理由的 `any`。
   - 纯 `.js` / `.mjs` 脚本中，新写或实质改动的公共函数与复杂数据结构用合法 JSDoc（`@param`、`@returns`、`@typedef`），不写 TS 专有语法。
   - 不借此发起 JS 转 TS 迁移，也不新增类型检查工具。
3. **行为验收**：QA 对确切产物、按明确的验收基线给出结论；涉及界面时附实际渲染与操作证据，只看代码不算视觉已验证。
4. **CI 与证据**：必需 CI 全绿，不静默跳过，不放宽断言、阈值或覆盖。
5. **知识**：变更涉及的 API、用户或运维知识已更新，并经独立核对；Knowledge Lead 对本次改动范围的覆盖或缺口给出记录。
6. **可交付**：增量可用、可部署；涉及迁移的有前滚或恢复路径。实际部署是另一件事。

评审结论不等于合并、发布或部署授权。

## 4. 六项生命周期事实

每个任务或产物分别记录下列六项，不压成一条线性状态。每项记录：状态（`unknown` / `pending` / `passed` / `failed` / `blocked` / `not_applicable`）、证据链接、修订或环境、观察者、时间。`not_applicable` 须写理由，且不能绕过必需关口；出现新修订时，受影响的证据作废。

| 事实 | 证据 | 记录者 |
| --- | --- | --- |
| `implementation_complete` | 开发的变更与测试交接（PR head）；不是独立批准 | Developer |
| `merged` | 平台确认的目标提交与合并关口；不等于验收或发布 | Team Leader |
| `accepted` | QA 对明确基线与确切修订的结论 | QA |
| `done` | Team Leader 核对产品 DoD 全部满足；可以早于发布 | Team Leader |
| `released` | 已授权发布的版本、不可变引用（tag）与发布说明 | Delivery/Release |
| `deployed` | 环境、产物标识、授权执行与冒烟结果（本项目为本地单机产品，通常 `not_applicable`，理由须写明） | Delivery/Release |

任务总表现有的“状态”列（`todo` → `in-progress` → `in-review` → `done`）继续作为摘要视图：

- **唯一记录位置**（D557）：自 D557 起，每个新任务的六项事实只记在[任务总表](tasks/README.md)该任务所在 Sprint 一节的“执行记录”表中，以任务 ID 为行，一事实一列。表头为 `| ID | implementation_complete | merged | accepted | done | released | deployed |`；每格写“状态 · 证据链接 · 修订或环境 · 观察者 · 时间”，尚无证据的写 `pending`。Sprint 计划 `S*.md`、任务书、PR 正文与协调者看板只链接或展示这一行，不另记。
- **写入路径**：Team Leader 提供证据（PR、head、合并提交、评审与 QA 链接、发布 tag 等）；Product/Design 在同步任务表时照录到该行，不改写结论，也不对证据做判断。这是“任务表只由设计角色修改”的例外，**只限执行字段**；任务的含义、范围与顺序仍只由 Product/Design 决定。
- 协调者的 team-dashboard 只是这张表的视图，不是第二个权威来源。
- 摘要列写 `done` 的前提是 `done` 事实为 `passed`。
- 已结案的历史任务不追溯改写。

## 5. Sprint、里程碑、版本分开记录

- **Sprint** 是时间盒，用 `S<n>` 编号，计划写在 `design/tasks/S<n>.md`。
- **里程碑** 是结果检查点（如 M1、M2），可以跨多个 Sprint，评审写在 `design/reviews/` 或里程碑评审任务中。
- **版本** 是可发布产物，遵循 SemVer，tag 写作 `vX.Y.Z`。
- 三者分别填写，不做强制的一对一映射；不从 Sprint 序号推出版本号。

## 6. 保留的用户偏好（迁移不改）

- **Sprint 收尾仪式**：RC → Demo → Sprint 评审 → 回顾，流程见[发布流程](../docs/release/README.md)。
- **版本号**：SemVer；只含重构与开发工具的 Sprint 按 D456 的先例取补丁版本。
- **开发人数**：同时最多 3 个开发，均用 Opus 5.5。
- **会话归档**：PR 合并后归档该开发会话。这是已有的用户偏好；归档前仍要确认没有未提交改动、未关闭的 PR 或进行中的工作。
- **PR 正文**：必须包含“用户可见变化”和“疑似缺陷”两节。

**节奏说明**：新模型**允许**某个 Sprint 不发布版本，也允许一个 Sprint 发多个版本。但在用户另行确认之前，团队保持现行节奏：每个 Sprint 按上面的仪式收尾，并发布一个版本。

## 7. 迁移范围与缺口

- **在途任务不受影响**：REFAC-31 至 REFAC-34 的任务书、验收与冲突域不改，按原文执行和评审。
- **设计阶段质量项**：从 D555 之后的下一份任务书起加入；纯重构的适用规则见 §3 第 1 项（D557）。
- **已知缺口**（登记在唯一待办，由各负责人处理）：
  - `docs/README.md` 系统入口与覆盖矩阵尚未建立。负责人：Knowledge Lead。
  - `design/test-cases.md` 的维护者由设计角色移交给 QA：已于 D560（KDOC-02）完成，文件开头已注明，用例内容未改。
  - 六项生命周期事实的首次实际记录从下一个新任务开始，记在任务总表的“执行记录”表（§4）。证据：Team Leader；照录：Product/Design。
