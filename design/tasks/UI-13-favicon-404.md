# UI-13 首页每次加载一条 404（疑似 favicon）

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)），低优先级　依赖：—　建议分支：`ui-13-favicon-404`
- 冲突域：web:entry（`packages/web/index.html`、新增 `packages/web/public/` 下的图标文件）。不含 `src/styles.css` 与 `src/main.tsx`，与 UI-11d 不相交。若 404 不是 favicon、而要改 `packages/infra/src/http`，先报告设计角色重新划域。
- 类型：调查 + 静态资源
- 来源：v0.5.0 Demo [#129](https://github.com/lingshf/ai-native-erp/pull/129) 的产品观察（版本管理报告）：每轮首页都有一条 404；从代码推测是 favicon，**尚未抓包证实**。

## 现状（main `49d936b`，推断依据）

- `packages/web/index.html` 没有 `<link rel="icon">`；`packages/web` 下没有 `public/` 目录。浏览器默认会请求 `/favicon.ico`。
- 服务端对未知路径返回 404（`packages/infra/src/http/index.ts:97`、:114）。
- 以上只说明 favicon 是可能来源，不能确定那条 404 就是它。

## 范围

1. **先证实**：在真实 Chrome 中打开首页，用 CDP `Network` 事件（或 Playwright `page.on("response")`）记录所有状态码 ≥ 400 的请求的 URL、类型与发起方，附到 PR 描述。
   - 若确为 `/favicon.ico`：继续第 2 步；
   - 若是其他 URL：停止，报告设计角色，按实际来源重新立项。
2. **修**：在 `packages/web/public/` 新增一个小的 SVG 图标（不引入新依赖，gzip ≤ 1 kB），`index.html` 加 `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`；确认生产构建把它复制到 `dist`，且本机服务能以 200 返回。
   - 不改服务端路由规则；不为 `/favicon.ico` 加特例。
3. 图标与 Dynamics 365 风格协调（单色或主题主色），红 / 绿主题不需要两套图标。

## 验收标准

1. 修复前的抓包记录（base）与修复后的记录（精确 head）都在 PR 描述中：修复后首页加载没有状态码 ≥ 400 的请求。
2. 生产构建产物中有图标文件；本机服务 `GET /favicon.svg` 返回 200、`Content-Type` 为 `image/svg+xml`。
3. 现有测试与 E2E 不删除、不削弱（D11）；若加回归测试，放在最低能覆盖的层（例如构建产物检查或 HTTP 测试），不新增 slow E2E。
4. 无 `package.json` / lock 变化。
