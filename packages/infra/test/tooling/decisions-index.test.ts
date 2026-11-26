import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../../../../scripts/gen-decisions-index.mjs";

const script = fileURLToPath(
  new URL("../../../../scripts/gen-decisions-index.mjs", import.meta.url),
);
const entry = (line: string) => classify(line, true);

test("explicit decision entries missing the colon or closing parenthesis are errors", () => {
  for (const line of [
    "- **D594 新决定**（方案 A） 新决定正文",
    "- **D594 新决定**（方案 A：新决定正文",
    "- **新决定**（方案 A：起因见 D571，正文",
  ])
    assert.ok(entry(line)?.error, line);
});

test("the parenthetical is checked even when the bold lead names a decision", () => {
  assert.ok(entry("- **D594 新决定**（起因见 D571）：新决定正文")?.error);
  assert.deepEqual(entry("- **D594 新决定**（追加：D571）：正文"), { entries: [594, 571] });
  assert.deepEqual(entry("- **D594 新决定**（方案 A）：正文"), { entries: [594] });
  assert.deepEqual(entry("- **计划**（SEC-02，D568）：正文"), { entries: [568] });
});

test("bold prose that cites a decision without the entry shape stays a mention", () => {
  for (const line of [
    "- **main Full 红时暂停合并**（D456）。",
    "8. **合并后检查分两段**（MCF-18a、MCF-18b，起因见 D576）。时：",
    "- **新增决定 D580–D590**（11 条，都由协调者决定）；收尾时另增 D591。",
  ])
    assert.equal(entry(line), null, line);
  // Outside design/ a bold lead is never an entry, so it cannot be malformed.
  assert.equal(classify("- **D594 新决定**（方案 A） 正文", false), null);
});

const INDEX =
  "# 决定索引\n\n| 编号 | 类型 | 摘要 | 位置 |\n| --- | --- | --- | --- |\n| D1 | 表 | 起点 | [design/log.md:1](log.md) |\n";

function repository(t: { onTestFinished: (fn: () => void) => void }, logLine: string) {
  const root = mkdtempSync(join(tmpdir(), "erp-decisions-index-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "design"));
  writeFileSync(join(root, "design/decisions.md"), INDEX);
  writeFileSync(join(root, "design/log.md"), `| D1 | 起点 |\n${logLine}\n`);
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
  ])
    assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  const index = () => readFileSync(join(root, "design/decisions.md"), "utf8");
  return { run, index };
}

test("a malformed entry fails both modes with exit 2 and leaves the index untouched", (t) => {
  for (const bad of [
    "- **D2 新决定**（方案 A） 新决定正文",
    "- **D2 新决定**（方案 A：新决定正文",
    "- **D2 新决定**（起因见 D1）：新决定正文",
  ]) {
    const { run, index } = repository(t, bad);
    for (const mode of [[], ["--check"]]) {
      const result = run(...mode);
      assert.equal(result.status, 2, `${bad} ${mode}`);
      assert.match(result.stderr, /^design\/log\.md:2: /mu);
      assert.match(result.stderr, /design\/decisions\.md not written\./u);
      assert.equal(index(), INDEX);
    }
  }
});

test("a well-formed entry is indexed at its line", (t) => {
  const { run, index } = repository(t, "- **D2 新决定**（方案 A）：新决定正文");
  assert.equal(run().status, 0);
  assert.match(index(), /^\| D2 \| 条目 \| {2}\| \[design\/log\.md:2\]\(log\.md\) \|$/mu);
  assert.equal(run("--check").status, 0);
});
