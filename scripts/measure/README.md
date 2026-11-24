# scripts/measure：Web 体积测量

改动 Web 的任务在 PR 里报体积时用这里的脚本，不再每个 PR 临时附带测量脚本。
只用 Node 内置模块，不需要额外安装依赖。

| 文件                 | 作用                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `bundle-measure.mjs` | 在两个确切 SHA 上各建一个分离 worktree，`npm ci` 后构建，打印构建来源，再调用比较   |
| `bundle-compare.mjs` | 比较两个已构建好的 `dist`（须带 `.vite/manifest.json`），检查预算。口径只在这里实现 |

## 用法

一般直接用 `bundle-measure.mjs`。base 用 PR 的合并基点，head 用最终推送的提交，两者都写完整 40 位 SHA：

```powershell
node scripts/measure/bundle-measure.mjs `
  --base <40 位 base SHA> --head <40 位 head SHA> `
  --work C:\tmp\meas-<任务号> `
  --route src/TradeOrders.tsx=+300 --chunk src/TradeOrders.tsx=+300
```

- `--work`：工作目录，必须是不存在的新目录。脚本在其中建 `base\`、`head\` 两个分离 worktree。
- `--repo`：仓库目录，默认是当前目录。
- 其余参数是预算，原样交给 `bundle-compare.mjs`（见下节）。

已经有两份 `vite build --manifest` 的产物时，可以只做比较：

```powershell
node scripts/measure/bundle-compare.mjs <base-dist> <head-dist> [预算参数]
```

### 预算参数

| 参数                     | 含义                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `--first-screen <limit>` | 首屏屏蔽哈希后的 gzip-9 总字节                                                                                     |
| `--d454`                 | 首屏只有预加载顺序不同、且满足 D454 四条时，首屏一项视同 ±0                                                        |
| `--route <key>=<limit>`  | 某路由的“路由新增”字节，`key` 是 manifest 键，如 `src/TradeOrders.tsx`                                             |
| `--chunk <key>=<limit>`  | 某个首屏以外 JS chunk 的字节（如 `src/TradeOrders.tsx`、`_useQuery.js`），或某个 CSS 文件（如 `assets/index.css`） |

`limit` 写法：`+N` 表示最多增加 N 字节，减少不限；`±N` 或 `N` 表示变化的绝对值不超过 N。
没有列出的项一律须 ±0。预算里写了却不存在的键算用法错误（退出码 2），以防键名拼错后预算悄悄失效。

## 口径

预算一律按**屏蔽哈希后**的 gzip-9（`zlib` level 9）字节判定；报告里每项同时列出原始字节，仅供参考。屏蔽规则：文本中 `名字-8位哈希.js|css`
一律换成 `名字-HASH.js|css`（与 #288 相同），这样只因哈希不同而变化的引用不会算作体积变化。

- **首屏（D432、D454）**：`index.html` 里入口 `<script src>` 与 `<link rel="modulepreload">` 引用的
  `assets/*.js`，加上它们在 manifest 中的静态 `imports` 闭包。`<link rel="prefetch">` 等其他链接和动态导入
  （`dynamicImports`）都不算首屏。
- **路由新增（D432）**：某路由懒加载入口（manifest 的 `isDynamicEntry`）的静态导入闭包，减去首屏闭包。
  几个路由共用的 chunk 在每个路由里都算一次；首屏里已有的 chunk 不算进任何路由。
- **路由 CSS**：路由闭包里各 chunk 的 `css` 列表，逐个文件列出“原始/gzip-9”字节，仅供核对。
- **首屏预加载顺序（D454）**：首屏只有预加载顺序不同时，同时满足以下四条即视同 ±0：
  ① 预加载集合相同（首屏闭包与 `m.f` 表的集合都相同）；② 原始字节 ±0；
  ③ 把 `m.f` 表与每个 `__vite__mapDeps` 列表各自排序后，base 与 head 的文本完全相同；
  ④ 屏蔽哈希后的 gzip-9 差 ≤ ±10 B。只有加了 `--d454` 才启用；四条逐条打印。
- **构建来源（D460、D487）**：基线必须取自确切 SHA 上新建的分离 worktree。两侧分别打印
  `git rev-parse HEAD`、`git status --porcelain`（`npm ci` 前、后和构建后都须为空）、`node -v`、`npm -v`、OS、
  `git rev-parse <sha>:package-lock.json`、完整命令行，以及逐资产 SHA-256（不截断）。整段可直接贴进 PR 的
  “构建来源”。两侧 lockfile blob 不同时直接退出 3，不比较。

## 退出码

| 码  | 含义                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| 0   | 全部项在预算内（未列出的项 ±0）                                                                                       |
| 1   | 有项超出预算，或未列出的项有变化                                                                                      |
| 2   | 用法错误：参数缺失或未知、预算写法不对、预算键不存在；单独运行 `bundle-compare.mjs` 时 `dist` 读不了（如缺 manifest） |
| 3   | 来源问题：SHA 不是 40 位、worktree 不干净、`HEAD` 与 SHA 不符、lockfile 不同、`npm ci` 或构建失败                     |

## 示例输出

同一份构建与自身比较（节选，完整输出 172 行）：

```text
## First screen (D432 / D454)
JS base: index.html
JS head: index.html
D454 ① preload set equal: true
D454 ② raw ±0: true
D454 ③ text equal after sorting m.f and __vite__mapDeps: true
D454 ④ masked gzip-9 |Δ| ≤ 10 B: true

## Route CSS (raw B / masked gzip-9 B, base → head)
src/TradeOrders.tsx: assets/TradeOrders.css 2977/881, assets/components.css 12422/2564, … → …

## Budgets (decided on masked gzip-9 B; raw B for reference)
| kind | key | raw base | raw head | gzip base | gzip head | Δ gzip | limit | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| first-screen | first-screen | 530726 | 530726 | 160942 | 160942 | 0 | ±0 | PASS |
| route | src/Accounts.tsx | 37034 | 37034 | 12545 | 12545 | 0 | ±0 | PASS |
…

## Asset SHA-256 (base: …)
5c6854ab256c463b3e19d4570a41cd8fcb0971f4b59fdd404c80c37860147e2f  index.html
…

RESULT: PASS
```

`bundle-measure.mjs` 在这之前为每一侧打印 `## Build provenance: base|head` 一节（上面列出的全部来源字段）。

## 清理

脚本**从不删除**任何目录。结束时打印清理命令，确认不再需要后自己执行：

```powershell
git -C "<repo>" worktree remove --force "<work>\base"
git -C "<repo>" worktree remove --force "<work>\head"
Remove-Item -Recurse -Force "<work>"   # or: rm -rf "<work>"
```

## 测试

`packages/infra/test/tooling/bundle-compare.test.ts` 用测试内构造的小型假 `dist` 覆盖上述口径，不跑真实构建：

```powershell
npx vitest run packages/infra/test/tooling/bundle-compare.test.ts
```
