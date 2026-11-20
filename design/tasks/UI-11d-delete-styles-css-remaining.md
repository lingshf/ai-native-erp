# UI-11d 删除 `styles.css` 保留的全局声明（D-7 完成）

- Sprint：S5 收尾后的 backlog（版本由协调者定）　依赖：[UI-11b](UI-11b-s5g-leftover-button-checkbox.md)、[UI-11c](UI-11c-virtualrows-spacer-cells.md) 都合并（外壳串行最后）　建议分支：`ui-11d-delete-styles-css`
- 冲突域：web-ui:shell（**只改 `src/styles.css`，以及文件清空时 `src/main.tsx` 中 `import "./styles.css";` 这一行**）。证据覆盖全部页面，开工时不应有正在进行的页面 CSS 任务。
- 类型：CSS，外加入口 import 一行
- 来源：S5-g [#126](https://github.com/lingshf/ai-native-erp/pull/126) 保留的声明：`input[type="checkbox"]`（整条）；`button { background; color; border; border-radius; cursor }`；`button:hover:not(:disabled)`；`button:active:not(:disabled)`；`th, td { border-bottom; vertical-align; min-width }`。

## 范围

- 方法与 [S5-g](S5-g-delete-global-element-rules.md) 相同：探针 + 第二道检查（未采集状态的源码检查）。另须补采 UI-11b、UI-11c 列出的状态。
- 两道检查都通过的声明删除；仍有遗漏的原样保留，列出归属冲突域并报告设计角色，不在本任务里改页面 CSS。
- 文件全部清空时删除 `styles.css` 和 `main.tsx` 中的 import。只改 CSS 的“JS 逻辑不变”证明为：`git diff <base>..HEAD -- '*.ts' '*.tsx'` 只含这一行删除。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) 1、3–5。PG-05：相对 merge-base，CSS 合计 gzip **减少**；入口 JS 与路由 chunk 不变。
2. 全部导航路由、两主题、1440 / 390，以及 S5-a..f、S5-i、UI-11b、UI-11c 补采的状态：计算值“变”为 0，像素差为 0。
3. PR 描述附第二道检查表（元素、文件:行、覆盖它的类规则），每条被删的全局声明都有。
4. D-7 只有在 `styles.css` 不再含任何全局元素规则后才写“完成”；否则写“部分完成”及剩余项。合并后设计角色把摘要追加到 [UI-1.md §5](../reviews/UI-1.md)，并在发布前确认 D-7 的写法。
