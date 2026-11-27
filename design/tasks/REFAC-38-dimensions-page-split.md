# REFAC-38：拆分财务维度页 `Dimensions.tsx`（不改行为）

- Sprint：S31（[计划](S31.md)）
- 类型：重构（web 页面；财务维度维护）
- 优先级：P2
- 决定：[D621](S31.md#s31-期间决定)。REFAC-38 不改行为：DOM、请求、焦点、Hook 序列、组件边界与 `key`、chunk 归属都不变；新增的只有无 Hook 的展示组件、纯函数和原样搬移的组件。详见“范围与决定”1–9。
- 建议分支：`refac-38-split-dimensions-page`
- 来源：[S31 范围与验收](S31.md#范围与验收)第 2 行、[三项 REFAC 共用：可读性与嵌套复验](S31.md#三项-refac-共用可读性与嵌套复验)；本任务书不放宽。
- 模板：[REFAC-35](REFAC-35-reports-page-split.md)（页面拆分、Hook 序列、jsdom 驱动 R4、打包字节 R7）。
- 迁移：**不加**。
- 浏览器时段：**不需要**。真实 Chrome 场景不进入维度页（见“现状·测试”），等价由 R3、R4 在 jsdom 中证明。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)，`DimensionEditor` **215** 行、`DimensionPane` **126** 行，是 web 端尚未拆分的最长组件中的两个（S31 计划按 D617 选定）。
- 两者职责可分：`DimensionEditor` = 草稿初值 + 字段渲染 + 提交；`DimensionPane` = 查询与虚拟滚动 + 表格 + 编辑器开关。拆分可以不动 Hook 与组件边界。
- 页面有完整的 jsdom 测试（8 个用例），等价证据可沿用 REFAC-35 的驱动方法。

## 现状（main `3c571b8`）

下文 `file:line` 都按 `3c571b82062a3b599a332defdfa089d1631a402d`（S31 计划 [#471](https://github.com/lingshf/ai-native-erp/pull/471) 合并提交）；`packages/` 与 `67db1e3` 相同（`git diff --stat 67db1e3 3c571b8 -- packages` 无输出）。

- `packages/web/src/Dimensions.tsx` 共 **586** 行，最后一次改动为 `ea24f87`（[#296](https://github.com/lingshf/ai-native-erp/pull/296)，TLIST-04）。
- **导出**只有 `Dimensions`（`:55`）；`App.tsx:44-45` 懒加载，路由 `:337-340`，导航 `NavLink` `:209`。
- **导入**（`:1-16`）：`react`、`@tanstack/react-query`、`@tanstack/react-virtual`、`@erp/core/contracts` 的 schema、`./ui/index.ts`、`./master-data-client.ts`、`./ui/components/index.tsx`、`./pages/master.css`（`TradeMaster.tsx` 也导入它；本任务不改 CSS）。
- **模块级定义**：
  - 类型 `T`（`:17`）、`Kind`（`:18`）、`Failure`（`:32`）；
  - 常量 `kinds`（`:19`）、`rules`（`:20-31`）、`specific`（`:362-369`）、`arrays`（`:370`）、`jsonFields`（`:371`）；
  - 函数 `failure`（`:33-44`）、`Notice`（`:45-54`）、自定义 Hook `usePage`（`:119-133`）；
  - 组件 `Dimensions`（`:55-118`）、`CompanyDimensions`（`:134-205`）、`DimensionActions`（`:207-232`，`:206` 有 TLIST-04 注释）、`DimensionPane`（`:233-361`）、`DimensionEditor`（`:372-586`）。
- **Hook 序列**（自定义 Hook 按调用处展开）：
  - `Dimensions`：`useState("")` `:57` → `useInfiniteQuery` `:58-69`（键 `["companies"]`，URL `/api/v1/companies?limit=100[&cursor=]`）。`t`（`:56`）在 Hook 之前。
  - `usePage`：`useInfiniteQuery`（键 `["dimensions", company, kind, dimension]`，`enabled`，`refetchOnMount: true`，URL `/api/v1/dimensions?company=&kind=&limit=100[&dimension=][&cursor=]`）。
  - `CompanyDimensions`：`useState<Kind>("dimension")` `:135` → `useState("")` `:136` → `usePage(company.code, "dimension", "", kind === "value")` `:137`。
  - `DimensionPane`：`useState`（editing）`:244` → `useQueryClient` `:245` →（派生 `queryKey`、`refresh` = `resetQueries` exact，`:246-247`）→ `usePage` `:248` →（`rows` `:249`）→ `useRef`（scroll）`:250` →（`virtual = rows.length > 100` `:251`）→ `useVirtualizer` `:252-257`（`estimateSize` 44、`overscan` 5）→（派生 `measured`、`visible`、`before`、`after` `:258-263`）。
  - `DimensionEditor`：`useQueryClient` `:387` →（`fields` `:388`）→ `useState`（draft，惰性初值 `:389-411`）→ `useState`（error）、`useState`（busy）`:412-413` → `useRef`（generation）、`useRef`（controller）`:414-415` → `useEffect`（卸载清理，依赖 `[]`）`:416-422`。
- **`key`**：`CompanyDimensions` `key={company.code}`（`:115`）；`DimensionPane` `` key={`${kind}:${dimension}`} ``（`:196`）；`DimensionEditor` `key={editing ? `${editing.code}:${editing.revision}` : "new"}`（`:350`）。
- **`submit`**（`:423-477`）：`preventDefault` → `busy` 时提前返回（`:425`）→ 逐字段解析，`SyntaxError` 时 `setError` 路径为该字段并返回（`:442-445`），其他异常重新抛出（`:443`）→ `dimensionWriteSchema.safeParse`，失败时 `setError` 并返回（`:449-456`）→ `generation` 加 1、新 `AbortController`、`setBusy(true)`、`setError(null)` → `masterRequest` `PUT`（有 `initial`）或 `POST` `/api/v1/dimensions` → 成功且代次未变时 `close()`；`catch` 代次未变时 `setError(failure(issue))`；`finally` 代次未变时 `setBusy(false)`，成功或代次已变时 `invalidateQueries(["dimensions", company.code])`。
- **焦点**：`git grep -n -E "\.focus\(|autoFocus" 3c571b8 -- packages/web/src/Dimensions.tsx packages/web/src/ui packages/web/src/master-data-client.ts` 无输出。键盘可达性来自滚动区 `section` 的 `tabIndex={0}`（`:275-281`，带 `biome-ignore`）；占位行 `:296`、`:328` 也带 `biome-ignore`。
- **测试**：`packages/web/test/dimensions.test.tsx` 328 行、8 个用例（`:28`、`:100`、`:149`（UI-16）、`:257`（L2）、`:274`（L3）、`:283`（L4 / L7）、`:301`（L5）、`:320`（L6））；设计角色在 `3c571b8` 上实跑 `npx vitest run --project web packages/web/test/dimensions.test.tsx`，8 个通过。真实 Chrome 不进入维度页：`infra/test/support/trade-gui/scenario/part-one.ts:101` 命中的 `dim.save` 提交的是 `/api/v1/trade/${kind}`，属于贸易页；`infra/test/http/dimensions.test.ts` 是服务端 API 测试；`design/ui/screenshots/UI-04/capture.mjs` 的维度截图不在 CI 中。
- **文档引用**：`git grep -n -e "web/src/Dimensions.tsx" -- docs README.md` 无输出，拆分后无需改文档。

### chunk 归属与首屏

- `Dimensions.tsx` 只由 `App.tsx` 懒加载，自成路由 chunk；v0.21.0 实测路由 `src/Dimensions.tsx` 为 35571 B / gzip 12504 B（`docs/demo/v0.21.0/logs/bundle-measure-sprint.out.log:369`），入口 chunk 11174 B / gzip 3734 B（`:395`），CSS 闭包为 `components.css`、`index.css`、`master.css`（`:349`）。这些是历史数字，R7 以开发在实际合并基上的实测为准。
- 新文件只由 `Dimensions.tsx`（或彼此）导入，留在同一路由 chunk，不进首屏。

## 范围与决定

1. **只拆不改**：不改任何文本键、类名、属性、请求 URL、查询键、选项与回调行为；不修缺陷。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **Hook 序列不变**：每个组件的 Hook 调用顺序、参数与依赖源文本不变（R5a）。允许把**整个组件**原样搬到新文件（它的 Hook 随之搬移，序列不变）；不允许把一个组件的部分 Hook 拆到另一个组件。
3. **组件边界与 `key` 不变**：`Dimensions`、`CompanyDimensions`、`DimensionActions`、`DimensionPane`、`DimensionEditor` 五个组件仍各自存在，父子关系与上述三处 `key` 不变。不加 `memo`。
4. **新增组件只做展示**：新抽出的组件不调用任何 `use*`（R5b），只接收值与回调。建议（不强制）：`DimensionEditor` 的字段区抽为展示组件，草稿初值（`:389-411` 的初值函数体）抽为纯函数；`DimensionPane` 的表格（`:274-337`）抽为展示组件。
5. **`submit` 留在 `DimensionEditor`**：它读写 `busy`、`generation`、`controller` 与 `client`，搬出会改变闭包结构。允许把 `:432-447` 的逐字段解析循环抽为纯函数（返回解析值或失败字段），条件是 `SyntaxError` 判定、非 `SyntaxError` 重新抛出与先后顺序不变（R5c 逐字比较循环体）。
6. **重复**（S31 共用表④，第三次出现即抽取）：
   - “加载更多”按钮 3 处（`:95-102`、`:178-185`、`:339-346`；第 3 处多一个类名 `ui-master-more`）→ 抽为一个展示组件，类名经参数传入，生成的 DOM 逐字节不变；
   - `pages.flatMap((page) => page.items)` 3 处（`:70`、`:168-169`、`:249`）→ 抽为一个函数；`:168-169` 原为 `?.` 链上无 `?? []` 的写法，抽取后 DOM 须不变（R4 判定）；
   - `Notice … retry={() => void X.refetch()}` 3 处（`:113`、`:191`、`:273`）已是共享组件 `Notice`，保留；
   - 2 处以内的重复（加载段落 `:111`、`:272`；`invalidateQueries(["dimensions", company.code])` `:475`、`:570`；占位行 `:295-300`、`:327-332`；`fields.some` `:552`、`:578`）可保留，PR 正文写明去向。
7. **注释随代码原样搬移**：`:206` 的 TLIST-04 注释与三处 `biome-ignore` 注释跟随所在代码。
8. **文件布局**：`Dimensions.tsx` 只保留 `Dimensions` 导出（名称、签名与懒加载入口不变）；其余组件、Hook、常量可搬到新目录 `packages/web/src/dimensions/`。新文件不得从 `../Dimensions.tsx` 导入运行时值；新文件之间单向无环（R5d）。
9. **不改的路径**：`packages/web/src/App.tsx`、`packages/web/src/ui/**`、`packages/web/src/master-data-client.ts`、`packages/web/src/pages/master.css`、`packages/web/test/**`、`packages/core/**`、`packages/infra/**`。

## 冲突域

写入域：web-ui:dimensions——`packages/web/src/Dimensions.tsx` 与新目录 `packages/web/src/dimensions/`（`3c571b8` 上不存在）。与 REFAC-39（infra 仓储）、REFAC-40（core 领域）无文件交集，可并行（[S31 分道](S31.md)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `3c571b8`）。

| 编号 | 检查 | base `3c571b8` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `DimensionEditor` **215**、`DimensionPane` **126**（失败） | `Dimensions.tsx` 与 `dimensions/` 内每个函数 ≤ 80 |
| R6b | 嵌套深度 | 最深为 `DimensionEditor` 3、`submit` 3（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `Dimensions.tsx` **586** | `Dimensions.tsx` ≤ **200**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`Dimensions.tsx` ≤ 200 由设计角色按决定 8 估定（保留导入、`Dimensions` 64 行与 `CompanyDimensions` 72 行时约 170 行），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/web/src/Dimensions.tsx` 与 `packages/web/src/dimensions/` 下的新文件；决定 9 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`、`jsx`）解析，`Dimensions.tsx` 的导出名集合两侧都为 `["Dimensions"]`，签名源文本相同（只归一空白）；`App.tsx` 无 diff。新文件的导出只在 `Dimensions.tsx` 与 `dimensions/` 内使用，PR 正文附 `git grep` 结果。`npm run typecheck`、`npm run check` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project web` 全部通过；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。
- **R4 DOM、请求、焦点等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 脚本，在 base 与 head 上按同一序列操作；渲染 `App`，起始 `#/dimensions`（同 `dimensions.test.tsx:25`）。`fetch` 桩借用 `dimensions.test.tsx` 的夹具与 `:28-99` 的写法（含 `getBoundingClientRect` 与 `ResizeObserver` 桩），改为受控响应：公司页可带 `nextCursor`；维度页可返回 101 行以上（触发虚拟滚动）；写请求可返回 201 / 200、409 `CONFLICT` 信封、400 带 `api.error.dimensions.<rule>` 的 `fieldErrors`、或网络错误。
  - **记录**：每次请求的序号、方法、URL（`pathname + search`）、请求体与 `signal.aborted` 最终值；`QueryClient.prototype.resetQueries` 与 `invalidateQueries` 用委托包装记录序号与参数，保留原实现；`HTMLElement.prototype.focus` 装记录桩；`window.confirm` 装记录桩。记录规则同 [REFAC-28 R4](REFAC-28-close-wizard-split.md#两侧都须成立的不变量)（委托包装、不用 `Proxy`、递增序号、确定性编码），并带 REFAC-17 自测（a）–（c）。
  - **每步采样**：`document.body.innerHTML`；累计请求日志；`resetQueries` / `invalidateQueries` 记录；`#dimension-company`、`#dimension-parent` 与种类选择的 `value`；焦点记录与 `document.activeElement`；`console.error` 记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同，并且**直接断言**下列期望值。预期值由设计角色从 `3c571b8` 源码与既有测试推出，**未用驱动在 base 上实测**；开发须先在 base 上跑通，任一条不成立即停下报协调者与设计角色，不得改断言迁就，也不得改产品代码。语言 zh，公司 `DEFAULT`（夹具同 `dimensions.test.tsx:6-23`）。
    1. **进入页面**：请求依次为 `GET /api/v1/companies?limit=100`、`GET /api/v1/dimensions?company=DEFAULT&kind=dimension&limit=100`（`:64`、`:127`）。
    2. **公司分页**：公司首页带 `nextCursor` 时出现“加载更多”（`master.loadMore`），点一次追加 `GET /api/v1/companies?limit=100&cursor=<值>`。
    3. **切到值**：种类选 `value`，再选上级 `DEPT`：追加请求中含 `GET /api/v1/dimensions?company=DEFAULT&kind=value&limit=100&dimension=DEPT`；`CompanyDimensions` 的定义查询（`:137`，与种类 `dimension` 列表同键）是否再发一次取决于缓存新鲜度，不作直接断言，只比两侧相同。
    4. **虚拟滚动**：值返回 100 行且带 `nextCursor`，点“加载更多”后共 200 行：表格 `aria-rowcount` 为 `201`，出现 `tr[aria-hidden="true"]` 占位行，渲染的数据行少于 200（同 `:28` 用例）。
    5. **刷新列表**：点 `master.listRefresh`：`resetQueries` 恰好 1 次，参数 `{ queryKey: ["dimensions","DEFAULT","value","DEPT"], exact: true }`；只重读第一页（同 L3、L5）。打开新建编辑器并输入后再刷新，草稿保留，`confirm` 无记录（同 L4 / L7）。
    6. **新建保存**：新建后提交合法草稿：1 次 `POST /api/v1/dimensions`，请求体为 `{ company: "DEFAULT", config: … }`；成功后编辑器关闭，`invalidateQueries` 1 次，键 `["dimensions","DEFAULT"]`。
    7. **编辑保存**：点某行“编辑”后提交：1 次 `PUT`，`config.revision` 为原行的 `revision`。
    8. **JSON 字段语法错误**：种类 `derivation`，`when` 填 `{`：不发请求；出现该字段的 `dim.issue.shape` 提示（`:444`）。
    9. **schema 失败**：清空 `code` 后提交：不发请求；错误路径不含 `config`（`:451`）。
    10. **409 冲突**：写请求返回 409 `CONFLICT`：出现 `master.conflict` 提示与 `master.reload` 按钮（`:36`、`:565-576`）；点该按钮后 `invalidateQueries` 1 次（键 `["dimensions","DEFAULT"]`），编辑器关闭。
    11. **字段规则失败**：写请求返回 400，`fieldErrors[0]` 为 `{ path: "code", messageKey: "api.error.dimensions.duplicate" }`：提示为 `dim.issue.duplicate`，挂在字段 `code` 上，不出现表单级 `role="alert"`（`:39`、`:578`）。
    12. **卸载中止**：写请求挂起时点“取消”：该请求 `signal.aborted` 为 `true`；`invalidateQueries` 1 次（代次已变，`:474-475`）。
    13. **焦点与键盘**：1–12 每一步焦点记录都为空（依据“现状·焦点”的枚举命令）；列表区有 1 个 `section.grid-wrap[tabindex="0"]`，`aria-label` 为当前种类文本。
    驱动另跑一遍 en、教学模式开与关各一遍，只比两侧相同。
  - **PR 正文附**：驱动全文与步骤清单；两侧输出的 SHA-256 与比较结果；直接断言 5、6、10、12 的逐步输出原文。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a Hook 序列**：PR 正文按组件列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），附参数与依赖源文本（只归一空白）。两侧逐行相同；base 一侧须与“现状”一致（`Dimensions` 2、`usePage` 1、`CompanyDimensions` 3、`DimensionPane` 5、`DimensionEditor` 7 项；`usePage` 在两处调用处展开）。没有豁免。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；附 Babel AST 检查脚本输出。
  - **R5c 原文搬移**：下列各项 base 与 head 逐字比较，只归一缩进；决定 6 的两处抽取是仅有的例外，PR 正文逐处贴出两侧原文：
    - 3 个查询的选项对象（`:58-69`、`:120-132`）与 `useVirtualizer` 选项（`:252-257`）；
    - `failure` 全文（`:33-44`）、草稿初值函数体（`:390-410`）、`submit` 函数体（`:424-476`；若按决定 5 抽出循环，循环体 `:433-446` 逐字比较）、`useEffect` 回调与依赖（`:416-422`）；
    - 派生表达式 `company`（`:71`）、`queryKey` / `refresh`（`:246-247`）、`virtual` / `measured` / `visible` / `before` / `after`（`:251-263`）、`fields`（`:388`）；
    - 三处 `key` 与 `DimensionEditor` 的全部 props（`:349-357`）；
    - 模块级常量 `kinds`、`rules`、`specific`、`arrays`、`jsonFields`。
  - **R5d 依赖方向**：新文件不从 `../Dimensions.tsx` 导入运行时值；新文件之间单向无环；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：用 `scripts/measure/bundle-measure.mjs`（写明脚本所在提交 SHA；`3c571b8` 上该文件最后一次改动为 `6156759`），base 取最终送审 head 的实际合并基，合并基变了就重测。预算（未列出项为 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件不在首屏闭包 |
  | 维度页路由 | `src/Dimensions.tsx` | ≤ **+700 B**（硬上限） | 估定，见下 |
  | 维度页入口 chunk | `src/Dimensions.tsx` | ≤ **+700 B** | 同上 |
  | CSS 与其他路由、共用 chunk | 全部 | ±0 | 不改 CSS，只导入 |

  命令参数：`--route src/Dimensions.tsx=+700 --chunk src/Dimensions.tsx=+700 --d454`。上限未做试改构建：REFAC-28 拆 263 行实测 +450 B（gzip），本任务要拆的两个组件合计 341 行，按比例约 +590 B，取 +700 B。出现 base 没有的新 chunk、或超出上限，即停下报设计角色与协调者；不得自行放宽，也不得为压字节改变拆分结构或行为。
- **R8 质量门**：R8a 合并前 `npm run typecheck`、`npm run check`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full 须绿，失败报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”逐项给出改前 / 改后数据。

### 测试命令

```powershell
npx vitest run --project web packages/web/test/dimensions.test.tsx
npx vitest run --project web
npm run typecheck; npm run check
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --route src/Dimensions.tsx=+700 --chunk src/Dimensions.tsx=+700 --d454
```

全量 web 测试有失败时，逐个列出失败文件与用例，并附 `npx vitest run --project web --no-file-parallelism <失败文件…>` 的串行重跑原文；串行仍失败的按真实失败处理。

## 性能考虑

- 渲染次数不变：组件边界与 `key` 不变，不加 `memo`，Hook 与依赖不变（决定 2、3）。新增展示组件是无状态函数组件，只多一层函数调用。
- 请求次数与时机不变（R4 直接断言 1–7、12）；虚拟滚动阈值（100 行）、`estimateSize` 44 与 `overscan` 5 原样搬移。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S31 共用要求](S31.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`3c571b8`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `Dimensions.tsx` 与 `dimensions/` 下每个函数 ≤ 80 | `DimensionEditor` 215、`DimensionPane` 126、`CompanyDimensions` 72、`Dimensions` 64、`submit` 55；其余 ≤ 26 | 量法对 `Dimensions.tsx` 与全部新文件的**完整输出**；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 | `DimensionEditor` 3、`submit` 3、`failure` 2、`CompanyDimensions` 2、`DimensionPane` 2；其余 ≤ 1 | 同一输出第 2 列；超过 2 层的逐个说明 |
| 文件长度（③） | `Dimensions.tsx` ≤ 200；新文件各 ≤ 150 | `Dimensions.tsx` 586；`dimensions/` 不存在 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | 见决定 6：加载更多 3 处、`flatMap` 3 处、`Notice` 调用 3 处（已共享）；2 处以内 4 类 | 每处去向 |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准，本任务书不另附。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 3c571b8 packages/web/src/Dimensions.tsx
node <保存位置>\s30-measure.cjs <head> packages/web/src/Dimensions.tsx @(git diff --name-only --diff-filter=A <base> <head> -- packages/web/src/dimensions)
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
12  2  :33-44    failure
10  0  :45-54    Notice
64  1  :55-118   Dimensions
1   0  :56       t
6   0  :62-67    queryFn
1   0  :68       getNextPageParam
15  0  :119-133  usePage
6   0  :125-130  queryFn
1   0  :131      getNextPageParam
72  2  :134-205  CompanyDimensions
26  0  :207-232  DimensionActions
126 2  :233-361  DimensionPane
1   0  :247      refresh
1   0  :254      getScrollElement
1   0  :255      estimateSize
215 3  :372-586  DimensionEditor
55  3  :423-477  submit
2   0  :478-479  fieldLabel
2   1  :494-495  onChange
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **②**：拆后 `DimensionEditor` 只做“取客户端与状态 → 提交 → 渲染表单外壳、字段区、操作与错误”；`DimensionPane` 只做“状态与查询 → 虚拟滚动计算 → 操作条、加载 / 错误、表格、加载更多、编辑器”。
- **⑤**：`100`（页大小与虚拟阈值）、`44`、`5` 原样保留，不新增未命名数字。
- **⑥**：不新增注释，除非拆分需要说明“为什么”。不留调试输出。
- **测试耗时**：PR 正文附 `dimensions.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。公司与种类选择、上级维度选择、分页与虚拟滚动、刷新列表、新建 / 编辑 / 保存、字段与冲突提示、中英文与教学提示、键盘滚动都不变（R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R3 汇总行、R4 两侧输出、R5 抽取输出、R6 量法输出、R7 测量输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上被拆函数的抛错、提前返回与上限分支清单及枚举命令 `git grep -n -e throw -e "return" -e "> 100" 3c571b8 -- packages/web/src/Dimensions.tsx`，并把 R4 直接断言逐一对到分支：`failure` 的 409 / 字段规则 / 400 或 invalid / 默认（`:35-43`，断言 10、11，默认分支由网络错误用例覆盖）；`submit` 的 `busy` 返回（`:425`，提交中再次提交）、`SyntaxError` 返回（`:445`，断言 8）、非 `SyntaxError` 重新抛出（`:443`，无法由合法 UI 触发，写明原因）、schema 返回（`:455`，断言 9）；虚拟阈值（`:251`，断言 4）。无法触发的分支写明原因并报协调者，不得静默删去。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4 后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、对比结果）；时点为评审批准后、合并前；未发不合并。
- **不需要浏览器时段**：行为等价由 R3 与 R4 证明；R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**：设计角色在 `3c571b8` 上跑过 `dimensions.test.tsx`（8 个通过）并实测了 R6 的 base 数字；R4 直接断言与 R7 base 字节**未实测**，开发先在 base 上跑，不成立或缺数时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S31 执行状态](S31.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `Dimensions.tsx` 与 `dimensions/*`，确认 main Full 结果，结论以评论发在开发 PR（S30 回顾行动 4）。

## 设计自查

- [x] 冲突域与 REFAC-39、REFAC-40、KDOC-15 逐文件不相交；不改 `App.tsx`、`ui/`、CSS 与测试文件。
- [x] R6a、R6c 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`Dimensions.tsx` ≤ 200 与 R7 +700 B 为估定硬上限，未试拆、未实测 base 字节，超出即停下由 TL 决定。
- [x] 进入、分页、切种类、虚拟滚动、刷新、新建、编辑、语法错误、schema 失败、409、字段规则、卸载中止、焦点都有直接断言并注明出处；未用驱动在 base 上实测（已写明，开发先在 base 上跑）。
- [x] 可读性五项都有要求、改前数据（S30 统一量法完整输出）与改后须列；无用户可见变化。
- [x] 交付清单含 S30 回顾行动 1（带修订号原始输出 + SHA-256）、2（分支清单与用例映射）、3（QA 结论留在开发 PR）；合并后项含行动 4。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。