# M1-R4 贸易 E2E 精简、断言、400 日志分类、LF 行尾

- 里程碑：M1 评审后续　依赖：M1-R　建议分支：`trade-test-trim`
- 冲突域：bench/CI, http
- **阻塞 v0.2.0：否**

## 背景

见 [M1 评审 §5、§6](../reviews/M1.md)：

- `trade-gui.slow.test.ts` 对中/英 × 红/绿四个组合各跑一遍完整主路径（30–47s 每个），全部落在 Full 第 3 片。语言和主题只影响渲染。
- 主路径中“已应用发票不能取消”只断言 HTTP 400 和出现 alert（`:462-482`），没有核对错误码。
- `packages/infra/src/http/errors.ts:96-100` 把所有 400（包括领域规则拒绝）记成 `errorType: "ParseError"`。
- Windows 上 `core.autocrlf=true` 的检出让 `biome ci` 报 CRLF 错误；`.gitattributes` 只对 `*.sql`、`*.oracle` 固定 LF。

## 范围

- 完整键盘主路径只跑 1–2 个组合（例如 zh/red 和 en/green）；其余组合做页面级冒烟：每个贸易页加载、`lang` 与 `data-theme` 正确、无硬编码文字。保留失败时的 trace，成功时不上传。
- 拒绝分支断言具体错误码。
- 400 日志按错误类型区分解析错误和领域拒绝。
- `.gitattributes` 增加 `* text=auto eol=lf`（二进制文件按需标记），并重新规范化。
- 分片平衡与 #55 协调，不重复改。

## 验收标准

1. Full 墙钟和第 3 片耗时都下降，给出前后 run 链接；四个组合仍都有覆盖。
2. 错误码断言在故意改错时失败。
3. Windows 新检出上 `biome ci` 通过。
4. CI 绿。
