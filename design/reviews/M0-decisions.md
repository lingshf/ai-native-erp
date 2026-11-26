# M0 决定 D5–D8 补记

KGAP-03（S26，[计划](../tasks/S26.md#范围与验收)第 3 行）。[M0 评审](M0.md)第 39–42 行列出了 D5–D8 的落实情况：D5–D7 只有标题与代码证据，D8 的描述在[决定索引](../decisions.md)中被截断。本页为这四条补上摘要，并给出规则原文的出处。

- 本页只是摘要与出处，**不改变原决定**；规则以下表链接的原文为准。
- 仓库中没有找到 D5–D8 的原始决定记录，即谁定、何时定、比较过哪些备选；“检索”一节列出了查找方法。本页不补写决策过程。
- 现行原文钉在根 `README.md` 最近一次改动的提交 [`5780f95c3a1c7908200cb8631fec38375666e5d2`](https://github.com/lingshf/ai-native-erp/blob/5780f95c3a1c7908200cb8631fec38375666e5d2/README.md)（#414，MCF-12）。“最早出处”是该规则文字第一次出现的提交。

| 编号 | 摘要 | 现行规则原文 | 最早出处 | 落实证据（M0 评审时） | 备选 | 原始决定记录 |
| --- | --- | --- | --- | --- | --- | --- |
| D5 | 维度组合统一采用 subset 口径：组合未列的维度不限制，必填、禁止仍独立校验 | [`README.md:72`](https://github.com/lingshf/ai-native-erp/blob/5780f95c3a1c7908200cb8631fec38375666e5d2/README.md#L72)：“D5 统一 subset：组合未列维度不限制，必填/禁止仍独立校验。” | #17（M0-09）[`bacdbcb` `README.md:62`](https://github.com/lingshf/ai-native-erp/blob/bacdbcb6906db2dd5326a7bdd6f1dc50769f2a0e/README.md#L62)：“允许组合统一采用 Enterprise 的 subset 口径，没有模式开关” | [M0.md:39](M0.md) | 原记录没有写备选比较。最早出处写了与旧口径的差别：“相对旧 Book exact，组合没填的可选段现在代表不限制该段……这是统一规则的有意放宽，不是双轨兼容；不提供旧账转换/导入工具。” | 未找到 |
| D6 | 历史反向逐行精确镜像同公司原已过账行，不按当前配置重跑默认或派生 | [`README.md:82`](https://github.com/lingshf/ai-native-erp/blob/5780f95c3a1c7908200cb8631fec38375666e5d2/README.md#L82)：“D6 历史反向逐行精确镜像同公司原已过账行，即使科目/维度后来失效，也不重跑默认/派生……” | #19（M0-10）[`b9f0de6` `README.md:70`](https://github.com/lingshf/ai-native-erp/blob/b9f0de6435337e82b210fea4d5de7e2e4d2a7c17/README.md#L70) | [M0.md:40](M0.md) | 原记录未写 | 未找到 |
| D7 | 业务事件待转：转入时在写事务内按当前配置重算预览并比对指纹，指纹过期返回冲突，Web 只用原命令重试确认 | [M0.md:41](M0.md)（规则与代码证据，按 D587 以此为依据）。根 README 中的相关原文：[`README.md:86`](https://github.com/lingshf/ai-native-erp/blob/5780f95c3a1c7908200cb8631fec38375666e5d2/README.md#L86) 写“队列转入按**当前配置**重新预览确认”，同一行另有以“D7：”开头的撤回重试规则（同一 reason 幂等、不同 reason 409，未知写结果只允许原命令重试） | #27（M0-15）[`a0bcfd0` `README.md:80`](https://github.com/lingshf/ai-native-erp/blob/a0bcfd0d84d7edb765dbadabd5c91d6686b474b1/README.md#L80) | [M0.md:41](M0.md) | 原记录未写 | 未找到 |
| D8 | 报表水位为二元组：凭证 MAX(sequence) 与同公司科目 SUM(revision)，两者分别比较，不相加 | [M0.md:42](M0.md)（完整描述）；[`README.md:156`](https://github.com/lingshf/ai-native-erp/blob/5780f95c3a1c7908200cb8631fec38375666e5d2/README.md#L156)：“D8 始终为 **GL sequence + 同公司 SUM(accounts.revision)**，不是 MAX。” | #22（M0-13）[`9424be8` `README.md:126`](https://github.com/lingshf/ai-native-erp/blob/9424be804a3307052d40d2e9eb867717680e0c0c/README.md#L126)：“D8 仍为 `sequence + SUM(accounts.revision)`”，用词是“仍为”，但没有找到更早的定义 | [M0.md:42](M0.md) | 原记录未写 | 未找到 |

D7 两处原文的侧重不同：M0 评审写的是转入时的重算与指纹，根 README 的“D7：”写的是撤回重试与未知写结果。本页只并列出处，不判断哪一处是原决定的全部范围。

## 检索

以下检索在 `ff9a4703ff252c0b4272c8fe1a0a7e425257d0c9` 上运行。

- 决定表行：`git grep -n -E "^\| *\*{0,2}D[5-8] " -- design docs` 只命中 `design/reviews/M0.md:39-42` 与 `design/decisions.md` 的索引行。[路线图 §6](../roadmap.md#6-决定记录)的决定表没有 D5–D8：`git grep -n -E "D[5-8]([^0-9]|$)" -- design/roadmap.md` 无输出。
- 最早出处：
  - D5：`git log --reverse -S "**D5：允许组合"` 的第一条为 #17；
  - D6：`git log --reverse -S "**D6：历史反向"` 的第一条为 #19；
  - D7、D8：`git log --reverse -G "(^|[^A-Za-z0-9])D7([^0-9]|$)" -- "*.md" "*.ts" "*.tsx"` 的第一条为 #27；D8 用同样的命令，第一条为 #22。
- #27 之前的根 README（`a401d6f7a33f959bfb64095db664cf66a0b39cfb`）中，D5、D6 的规则以粗体标题段落出现（第 62、70 行），没有决定人、日期或备选比较。
