# REFAC-22：拆分 `AccountEditor` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（页面）
- 优先级：P2
- 决定：[D541](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–7。
- 建议分支：`refac-22-split-account-editor`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆页面函数”。
  - 结构与验收照搬 [REFAC-18](REFAC-18-trade-editor-split.md)（#339 已合并），只换成“科目编辑器”的事实。
  - R4 的记录规则复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量) 的委托包装与记录编码。
  - main Full 只作合并后检查（R8b），不作合并前门。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- REFAC-18 合并后，设计角色在 `37362e7` 上用 `node files/fnlen.cjs packages/web/src` 实测。除首屏文件中的 `Workspace` 外，`packages/web/src` 中最长的路由内函数是 **`AccountEditor`（275 行）**，约为 ② 上限（80 行）的 3.4 倍。
- 不选 `Workspace` 的理由与 REFAC-18 相同：它在首屏闭包中，任何组织变化都直接进首屏预算（D454）。
- `AccountEditor` 在路由 chunk `src/Accounts.tsx` 内，首屏 ±0 可由构建直接证明。
- 它承载科目表的全部编辑交互：草稿、契约校验、控制科目的模块必选、类别与用途联动、保存与卸载时中止、冲突后重新加载、服务端字段错误。
- 错误提示的取值 `fieldMessage(error, <字段>)` 在函数内写了 **11 遍**（`issue` 1 遍，另 5 个字段的 `aria-invalid` 与 `aria-describedby` 各 1 遍）。这是本任务唯一的去重点（决定 5）。
- **节奏**：同一时间只有一个页面拆分在途。REFAC-18 已由 #339 合并；本批其他任务都不是页面拆分：TMAS-01 是功能修正，REFAC-21 改基础设施。
- 冲突域与同批任务不相交：
  - TMAS-01 只改 `packages/web/src/trade-master/`、`ui/trade-labels.ts` 与贸易主数据的测试和文档；
  - REFAC-21 只改 `packages/infra/src/storage/`。
  - 详见“冲突域”。

## 现状（main `37362e7`）

下文 `file:line` 都按 `37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2`。

- `packages/web/src/Accounts.tsx` 共 631 行，只导出 `Accounts`（`:62`）。模块内另有：
  - 类型 `T`（`:19`）；
  - `failure`（`:20–28`）；
  - `fieldMessages`（`:29–33`）、`fieldMessage`（`:34–40`）；
  - `groups`（`:41–47`）、`fresh`（`:48–61`）；
  - 组件 `AccountActions`（`:136`）、`CompanyAccounts`（`:162–249`）、`AccountRows`（`:250–356`），以及 **`AccountEditor`（`:357–631`）**。

  使用范围：
  - `T` 与 `failure` 由 `Accounts`、`CompanyAccounts` 与 `AccountEditor` 共用；
  - `fieldMessages`、`fieldMessage`、`groups` 只在 `AccountEditor` 内使用；
  - `fresh` 只在 `CompanyAccounts` 内使用。
- 设计角色用 `node files/fnlen.cjs packages/web/src` 实测（只列本文件）：

  ```text
  275	packages/web/src/Accounts.tsx:357-631	AccountEditor
  104	packages/web/src/Accounts.tsx:250-356	AccountRows
  88	packages/web/src/Accounts.tsx:162-249	CompanyAccounts
  ```

  `AccountRows` 与 `CompanyAccounts` 也超过 80 行，但不在本任务范围（决定 7），登记入候选池。
- **属性**：`initial`（`AccountCommand`）、`t`、`cancel`、`saved`。由 `CompanyAccounts`（`:235–245`）以 ``key={`${editing.code}:${editing.revision}`}`` 渲染：
  - `cancel` 为 `setEditing(null)`；
  - `saved` 先 `setEditing(null)`，再失效 `queryKey`。`queryKey` 是 `["accounts", company.code]`（`:166`），与 `submit` 迟到时失效的键**相同**。
- **Hook 调用**（`AccountEditor` 内，按源码顺序；R5a 以此作为 base 一侧）：
  1. `useQueryClient()`（`:368`）
  2. `useState(initial)`：`draft`（`:369`）
  3. `useState<unknown>()`：`error`（`:370`）
  4. `useState(false)`：`busy`（`:371`）
  5. `useRef(0)`：`operation`（`:372`）
  6. `useRef<AbortController | null>(null)`：`controller`（`:373`）
  7. `useEffect`，依赖 `[]`（`:374–380`）：卸载时先 `operation.current++`，再 `controller.current?.abort()`。
- **命令**：
  - `patch`（`:381–383`）：`setDraft` 合并字段。
  - `submit`（`:384–409`）：
    1. `busy` 时直接返回。
    2. `accountCommandSchema.safeParse(draft)` 失败，或 `purpose === "control"` 且 `controlModule === null` 时，`setError(new MasterDataFailure("invalid"))`，**不发请求**。
    3. 否则 `id = ++operation.current`，新建 `AbortController`，置 `busy`，清空错误。
    4. `revision === 0` 时 `POST`，否则 `PUT` `/api/v1/accounts`，带 `signal`。
    5. `operation.current === id` 时才 `saved()` 或 `setError(issue)`。
    6. `finally` 中，`operation.current === id` 时复位 `busy`；**否则**失效 `["accounts", initial.company]`（`:407`）。
  - `changeChoice`（`:410–440`）：
    - `controlModule` 取空串时设为 `null`；
    - 取值不合契约时 `setError(new MasterDataFailure("invalid"))`；
    - `category` 改变时：`reportGroup` 重置为 `groups[category][0]`；`normalSide` 在 `ASSET` / `EXPENSE` 时为 `DEBIT`，否则为 `CREDIT`；
    - `purpose` 改变时：`controlModule` 重置为 `null`；改为 `control` 时 `manualAllowed` 置为 `false`；改回其他用途时**不**恢复 `manualAllowed`；
    - 其余字段直接写入。
  - `issue(path)`（`:441–448`）：有字段错误时渲染 `p#account-<path>-error`（`role="alert"`、`.ui-error-text`）。
- **JSX**（`:449–630`；R5d 以此作为 base 一侧）：`FastTab#account-editor`（摘要：新建时为 `master.new`，否则为 `<代码> · <名称>`）→ `form.acct-form`，内含 3 项：
  1. `fieldset disabled={busy}`（`.ui-form-grid`，`:458–607`），内依次为：
     - 代码：`#account-code`，`required`，`pattern="[1-9][0-9]{3}"`，`revision !== 0` 时禁用；
     - 名称：`#account-name`，`maxLength={80}`；
     - 类别：`#account-category`；
     - 报表分组：`#account-report`；
     - 余额方向：`#account-side`；
     - 用途：`#account-purpose`；
     - 只在 `purpose === "control"` 时渲染：控制模块 `#account-module`，`required`，带 `aria-describedby="account-module-hint"` 与提示 `#account-module-hint`；
     - 对方科目：`#account-contra`，空串时转 `null`；
     - 复选框：“允许手工录入”（控制科目时禁用）、“启用”。
  2. 操作区 `.ui-form-actions`（`:608–617`）：
     - 注释 `:610`；
     - 保存按钮：`busy` 时禁用，文案为 `master.saving`；
     - 取消按钮。
  3. `error !== undefined` 时显示 `MessageBar`（`tone="danger"`、`role="alert"`，`:618–627`）：文案为 `t(failure(error))`；冲突时另有“重新加载”按钮，`onClick={saved}`。
- **字段错误的 11 处**：
  - `fieldMessage(error, ` 出现在 `:442`（`issue`），以及 `code`（`:466–467`）、`category`（`:487–489`）、`normalSide`（`:520–522`）、`purpose`（`:539–541`）、`contraOf`（`:582–584`）。后 5 个字段各有 `aria-invalid` 与 `aria-describedby` 两处。
  - 两个属性的取值规则相同：
    - 有错误时，`aria-invalid` 为 `true`、`aria-describedby` 为 `"account-<path>-error"`；
    - 没有错误时，两者都为 `undefined`。
  - 两个属性都写在 `onChange` 之后、子元素之前。
- **相近但不相同的处理**（拆分时最容易被误合并，R4 序列专门覆盖）：
  - 失效 `["accounts", company]` 有两条路径：
    - `saved`（父级传入）在当前操作成功后调用，并且关闭编辑器；
    - `submit` 的 `finally` 只在操作已过期时失效，例如卸载之后，且不关闭编辑器。

    两条路径**各自保留**。
  - `#account-module` 的 `aria-describedby` 固定指向提示，不随错误变化，不属于去重范围。
  - `changeChoice` 中的 `category`、`purpose` 两个分支各自重置不同字段，不合并。
- **数字字面量**：`80`（名称长度）、`[1-9][0-9]{3}`（代码格式）、`0`（新建版本）都是契约或语义值，不在 ⑤ 范围，原文不变。
- **导入方**：
  - `Accounts.tsx` 只被 `App.tsx:41–42` 懒加载，在 `:356` 渲染；
  - 它导入 `./pages/accounts.css`（`:17`）。
- **测试**：
  - jsdom：`packages/web/test/accounts.test.tsx` 共 479 行、11 个用例。经过编辑器的有：
    - `:121`：控制模块必选；新建与停用；切换偏好不丢草稿。
    - `:173`：字段校验保留草稿；区分 CAS 冲突，不重试也不覆盖。
    - `:261`：迟到的已接受写入只作用于原公司。
    - `:435`：L4 / L7，刷新列表时不询问，也不打断打开的脏编辑器。
  - 真实 Chrome：`git grep -n -e "account-editor" -e "account-code" -- packages/infra packages/web/test` 在 `37362e7` 上**没有命中**；e2e 场景不操作科目编辑器。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `37362e7` 上运行 `node scripts/measure/bundle-measure.mjs --base 37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2 --head 37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2 --work <新目录> --d454`。脚本取自 `37362e7`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `Accounts.tsx`（改） | 路由入口 chunk `src/Accounts.tsx` | `App.tsx:41–42` 懒加载，没有其他导入方 |
| `accounts/` 下新文件（新增） | 同上 | 只允许被 `Accounts.tsx` 或本任务的新文件导入（决定 6） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts` 只导入、不改（决定 7） |
| CSS | 不改 | `pages/accounts.css` 输出为 `assets/Accounts.css` |

base 数字（原始 / gzip-9 字节）：

| 项 | 键 | 原始 | gzip |
| --- | --- | --- | --- |
| first-screen | first-screen | 531160 | 161115 |
| route | `src/Accounts.tsx` | 37034 | 12545 |
| chunk | `src/Accounts.tsx` | 12637 | 3775 |
| css | `assets/Accounts.css` | 893 | 377 |

## 范围与决定

1. **不改行为**（D541）。以下全部不变：
   - DOM 结构、类名、文本；
   - 属性及其**先后顺序**，含 `id`、`required`、`pattern`、`maxLength`、`disabled`、`aria-*`、`role`、`htmlFor`；
   - 请求的 URL、方法、请求体与发出顺序；
   - `AbortController` 的创建与中止时机；
   - 查询键、失效的键与失效条件；
   - `saved` / `cancel` 的调用条件与次数；
   - 焦点与键盘行为；
   - `operation` 卸载保护与 `busy` 防重入的语义。

   只改代码组织，不修 bug。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务；例如改回非控制用途时不恢复 `manualAllowed`，这是 base 的现有行为，保留。
2. **Hook 顺序不变**：
   - Hook 可以留在 `AccountEditor`，也可以放进它在顶层无条件调用的自定义 Hook，例如 `useAccountEditor`。
   - **展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`。
   - 展开自定义 Hook 后，Hook 调用序列与“现状”所列 base 序列逐项相同：种类、先后、参数与依赖的源文本，只归一空白（R5a）。
   - 本任务**没有豁免**。
3. **命令**：
   - `submit`、`changeChoice`、`patch` 可以搬进自定义 Hook；
   - `submit` 中校验、`operation` 自增、新建控制器、置 `busy`、请求、`try` / `catch` / `finally` 三个条件的顺序与结构都不变；
   - 每次渲染仍读取当次状态，不改为缓存的闭包；
   - `changeChoice` 的泛型签名与 4 个分支原样搬移（R5c）。
4. **组件层级对等**：
   - 新组件一律在模块顶层定义。
   - 抽出的组件只替换“现状”所列 JSX 3 项之一，或第 1 项 `fieldset` 内的一段（例如单个字段、复选框组）；只渲染该段原来渲染的内容。
   - 不把相邻兄弟合成一个返回 Fragment 的组件。
   - 条件渲染（`#account-module`、`MessageBar`、“重新加载”按钮）的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。
5. **字段错误去重**（⑤，R6b）：
   - 11 处 `fieldMessage(error, …)` 改由**一个**模块顶层或 Hook 内的辅助取值。例如 `fieldIssue(error, path)` 返回 `{ key, props }`：
     - `props` 是 `{ "aria-invalid": …, "aria-describedby": … }`；
     - 有错误时 `aria-invalid` 为 `true`，`aria-describedby` 为 `` `account-${path}-error` ``；没有错误时两者都是 `undefined`。

     `issue` 与 5 个字段都通过它取值。
   - 属性对象在 JSX 中用展开写法，放在原来两个属性的**同一位置**（`onChange` 之后），使输出的属性顺序不变；R4 的 DOM 逐字节比较会核对。
   - `fieldMessages` 与 `fieldMessage` 本身原样保留，逐字不变。
6. **文件**：
   - 新建目录 `packages/web/src/accounts/`（base 上不存在），与 `trade-master/`、`trade-reports/` 等并列；
   - 新文件按职责命名，例如 `account-editor.tsx`、`use-account-editor.ts`、`account-fields.tsx`、`account-messages.ts`，粒度由开发定，写入 PR 正文；
   - 新文件只被 `Accounts.tsx` 或本任务的新文件导入；
   - `Accounts` 仍从 `./Accounts.tsx` 导出，签名不变，`App.tsx` 不改；
   - `AccountEditor` 可以留在 `Accounts.tsx`，也可以整体搬到新文件，`fieldMessages`、`fieldMessage`、`groups` 随之原样搬移；
   - 搬走后，`T` 与 `failure` 若两侧都要用，原样搬到一个新文件由两侧导入，定义文本逐字不变，**不复制**；
   - `./pages/accounts.css` 的导入留在 `Accounts.tsx` 原位置。
7. **不改**：
   - `Accounts`、`AccountActions`、`CompanyAccounts`、`AccountRows`、`fresh` 的函数体，可因决定 6 增删 `import` 行；
   - `App.tsx` 与路由表；`master-data-client.ts`；`ui/**`（含标签与教学文案）；CSS（含 `pages/accounts.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:accounts：只改 `packages/web/src/Accounts.tsx`，并在 `packages/web/src/accounts/` 下新增文件（决定 6）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：无，e2e 不操作科目编辑器（见“现状 / 测试”）。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "Accounts.tsx" -- docs design` 在 `37362e7` 上命中 32 行，都是当时的事实记录，不改。
- 与同批任务不相交：
  - TMAS-01 只改 `packages/web/src/trade-master/`、`ui/trade-labels.ts`、`packages/web/test/trade-master.test.tsx` 与 `docs/user/trade.md`；
  - REFAC-21 只改 `packages/infra/src/storage/`。

  三者没有共享文件。本任务与 TMAS-01 都跑 `web` 项目，但测试文件不同。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `37362e7` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `AccountEditor` 的行数 | **275**（失败） | ≤ 80；本任务新增或改动的函数也都 ≤ 80。`Accounts`、`CompanyAccounts`、`AccountRows` 不改，不计 |
| R6b | `git grep -n -F 'fieldMessage(error, ' <rev> -- packages/web/src/Accounts.tsx packages/web/src/accounts` 的命中数 | **11**（失败） | **≤ 2**，只出现在决定 5 的辅助内。PR 正文附 base 与 head 两侧检索原文 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/web/src/Accounts.tsx` 与 `packages/web/src/accounts/` 下的新文件；
  - 决定 7 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出不变**：
  - `Accounts.tsx` 的导出集合与 base 相同，只有 `Accounts`，类型为 function；
  - 参数类型的源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2；
  - 新文件的导出只在 `Accounts.tsx` 与 `accounts/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `accounts.test.tsx` 的 11 个用例、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、中止与失效等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本。借用 `accounts.test.tsx` 的渲染方式与按路径分派的 `fetch` 桩，在 base 与 head 上按同一序列操作。

    `fetch` 桩改为**受控响应**：
    - 保存请求可以挂起，也可以返回成功、400（带 `fieldErrors`）、409（`CONFLICT`）、500 或网络拒绝；
    - 桩记录每次收到的 `signal`，**不**自行响应中止，由驱动决定何时放行。

    - **驱动 A（整页）**：渲染 `App`，进入科目表页。
    - **驱动 B（中止与失效直接观测）**：
      1. 直接渲染导出的 `Accounts`，传入固定的 `preferences`，外面套 `QueryClientProvider`；
      2. 驱动新建这个 `QueryClient`，并把实例上的 `invalidateQueries` 换成**委托包装函数**：调用原实现，记录每次调用的参数；
      3. 卸载用 testing-library 的 `unmount()`。
  - **记录规则**：同 [REFAC-18 R4](REFAC-18-trade-editor-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`。
    - 调用时分配递增序号并立即写入记录。
    - 返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` / `rejected` 与结果。
    - 参数与返回值都经确定性编码（`Set` → `{"$set": […]}`、`Map` → `{"$map": [[k, v], …]}`；其余同 REFAC-17）。
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标。
  - **序列**至少包含：
    - **新建科目**：
      1. 列表首屏 → 新建；
      2. 填代码与名称；
      3. 类别改为 `LIABILITY`，再改为 `EXPENSE`；
      4. 用途改为 `control` → 出现 `#account-module`，“允许手工录入”被禁用并取消勾选；
      5. 不选模块就直接 `fireEvent.submit` 保存（绕过 `required`）；
      6. 选模块后保存成功（`POST`）。
    - **用途改回**：用途改为 `control` 再改回 `general` → `#account-module` 消失，`manualAllowed` 仍为 `false`。
    - **非法代码**：代码填 `"12"` 后派发 `submit`。
    - **编辑已有科目**（`revision > 0`）：代码输入禁用，保存发 `PUT`。
    - **保存挂起**：字段组与保存按钮禁用，按钮文案为 `master.saving`；再次派发 `submit` → 只发出 1 个请求；放行成功 → 编辑器关闭。
    - **服务端字段错误（400）**：三遍，`fieldErrors` 分别是：
      - `contraOf` 的 `api.error.account.contraParent`；
      - `category` 的 `api.error.account.contraChildren`；
      - `code` 的 `api.error.account.readOnly`。

      另一遍同时带 `normalSide` 与 `purpose` 两条，`messageKey` 任取上述之一。
    - **冲突（409）**：出现冲突错误条与“重新加载”按钮 → 点击“重新加载”。
    - **500 与网络拒绝**：各一遍。
    - **取消**：点击取消。
    - **卸载时的在途保存**（驱动 B），两遍：
      1. 保存挂起时卸载根组件，然后放行**成功**响应；
      2. 重新挂载，保存挂起时卸载根组件，然后放行**失败**响应（500）。
    - zh / en 各一遍；教学模式开与关各一遍（驱动 A）。
  - **每步采样**：
    - DOM：`document.body.innerHTML`；
    - 累计请求日志：序号、方法、URL、请求体原文、`signal.aborted`、结果；
    - 查询缓存：`queryKey`、`status`、`isInvalidated`，按键排序；
    - 驱动 B 的 `invalidateQueries` 记录；
    - 焦点调用记录；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且**直接断言**，只比两侧相同不够：
    1. **前端拦截**：不选模块的控制科目与非法代码两种情况都发出请求 **0 次**，错误条为 `master.invalid` 的当前语言文本。
    2. **防重入**：两次 `submit` 只记 1 个请求。
    3. **方法与请求体**：
       - 新建为 `POST`，编辑为 `PUT`，URL 都是 `/api/v1/accounts`；
       - 新建控制科目的请求体中 `manualAllowed` 为 `false`，`controlModule` 为所选值。
    4. **联动**：
       - 类别改为 `LIABILITY` 后，`#account-report` 的值为 `payables`，`#account-side` 为 `CREDIT`；
       - 改为 `EXPENSE` 后，两者分别为 `costOfSales`、`DEBIT`；
       - 用途改回 `general` 后，“允许手工录入”仍未勾选。
    5. **字段错误**：对每个带错误的字段 `<p>`：
       - `#account-<p>` 带 `aria-invalid="true"` 与 `aria-describedby="account-<p>-error"`；
       - `#account-<p>-error` 的文本为映射后标签的当前语言文本；
       - 其他字段**不**带 `aria-invalid`；
       - `#account-module` 的 `aria-describedby` 始终为 `account-module-hint`。
    6. **冲突**：错误条为 `master.conflict` 的当前语言文本，并有“重新加载”按钮。点击后编辑器关闭，`invalidateQueries` 恰好记 1 次，键为 `["accounts", <公司>]`。500 与网络拒绝时没有“重新加载”按钮，编辑器不关闭，`busy` 复位。
    7. **卸载时的在途保存**：
       - 两遍都在卸载后、放行前，记录到的 `signal.aborted` 为 `true`；
       - 两遍在放行后，`invalidateQueries` 都**恰好**记 1 次，键为 `["accounts", <公司>]`。这次失效只来自 `operation.current !== id` 分支（`:407`）：
         - 删掉该分支会使两遍都记 0 次；
         - 若把 `saved()` 改为不判断 `operation`，第 1 遍会记 2 次。
       - 两遍都没有 `setError` / `setBusy` 的效果，`console.error` 没有新增记录。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附：驱动全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“字段错误”“冲突”“卸载时的在途保存”三组场景的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），以及参数与依赖的源文本（只归一空白）。两侧逐行相同，base 一侧须与“现状”所列一致。没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败：
    - `failure`、`fieldMessages`、`fieldMessage`、`groups` 的定义；
    - `submit` 的函数体；
    - `changeChoice` 的签名与函数体。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中的 JSX 3 项（第 1 项再按段列出），并标出 head 中对应的唯一组件或表达式。
  - **R5e 未改部分**：`Accounts`、`AccountActions`、`CompanyAccounts`、`AccountRows`、`fresh` 逐字比较并输出结果；不同即失败。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`Accounts.tsx` ≤ 360 行。base 为 631 行；`CompanyAccounts`、`AccountRows` 不动，所以不设更低的线。
  - 新文件各 ≤ 200 行；每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层。
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：
  - 首屏按 D454。
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA。
  - base 为最终送审 head 的实际合并基；合并基变了就重新测量。

  预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表） |
  | 科目表路由新增 | `src/Accounts.tsx` | ≤ **+500 B** | 估定，见下 |
  | 科目表入口 chunk | `src/Accounts.tsx` | ≤ **+500 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/Accounts.tsx=+500 --chunk src/Accounts.tsx=+500 --d454`。
  - 出现 base 没有的新 chunk，即停下报告。
  - 超出上限时先停下，报设计角色与协调者，不得自行放宽。
  - 上限没有做试改构建：REFAC-18（#339，292 行）实测为 +329 B；本函数 275 行，沿用同一停止线。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`。PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。
  - 不得自行更换并发参数而不说明。
  - 串行重跑仍失败，即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖（决定 2）。
- 不跑 Bench。打包变化由 R7 约束。
- 其余项（规模、索引、查询次数、分页、事务）不适用：本任务不改数据访问，请求序列由 R4 核对。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`AccountEditor` 从 275 行拆到 ≤ 80 行（R6a）。
  - 最大的一块是 `fieldset`（`:458–607`，约 150 行），须按字段或字段组拆成若干 ≤ 80 行的组件。
  - `changeChoice`（31 行）与 `submit`（26 行）可以留在 Hook 内。
- **③**：`Accounts.tsx`（631 行）是热点；拆后 ≤ 360 行（R6），新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件、Hook 与函数名表达职责，例如 `useAccountEditor`、`AccountEditorForm`、`AccountChoiceField`、`AccountChecks`、`fieldIssue`。不用 `Part1`、`Section2` 这类名字。
- **④**：分层对齐 REFAC-10–18 的做法：
  - 状态、请求与命令在一个 Hook 内，展示组件只接收 props；
  - 不抽跨页共用件：科目字段组件只在科目表内使用，不与 `trade-master/` 共享。
- **⑤**：见决定 5（字段错误去重）。
- **⑥**：
  - `Accounts.tsx` 现有注释（`:610` 等）随代码保留；
  - 不新增注释，除非某处拆分需要说明“为什么”，例如属性展开须放在原位以保持属性顺序；
  - 不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `accounts.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。以下都不变（R3、R4）：
  - 科目的新建与编辑；控制科目的模块选择；类别与用途的联动；
  - 保存与失败提示；字段错误的高亮与说明；冲突后重新加载；取消；
  - 中英文与教学模式下的外观。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3（既有 jsdom 用例）与 R4 证明。R4 比较 DOM、请求、中止与失效逐步等价，并有直接断言。
  - e2e 不操作科目编辑器；合并后由 R8b 复核 main Full。
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `accounts.test.tsx` 已能渲染科目表、打开编辑器、驱动 400 / 409 与迟到写入（`:173`、`:261`）；
  - `QueryClient` 由驱动新建，实例方法可以用委托包装函数替换；
  - R6a、R6b 的 base 数字见“现状”与上表，由设计角色实测；
  - 本任务书**没有**试写驱动。若某个用例在虚构数据上构造不出来，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：
  - R2 的导出与 `git grep` 结果；
  - R3 汇总行；
  - R4 驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果与直接断言结果；
  - R5a–R5e 各表；
  - R6 行数表（base 与 head 两列）；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 本批只有本任务是页面拆分。
- [x] 冲突域与同批任务逐文件不相交，没有共享单文件。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值。
- [x] 0 次请求、防重入、卸载后中止与迟到失效都有直接断言；删掉过期分支会使断言失败。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
