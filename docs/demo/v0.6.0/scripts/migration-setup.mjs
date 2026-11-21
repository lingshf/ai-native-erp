// Demo v0.6.0：用测试夹具生成虚构旧账快照和期初明细文件，复制到指定目录（不碰真实旧账）。
// 用法：node docs/demo/v0.6.0/scripts/migration-setup.mjs <输出目录>
// 夹具会在当前目录下临时建 .legacy-fixture-*，本脚本复制完立即删除。
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { legacyFixture, openingItemsFile } from "../../../../packages/infra/test/support/legacy-fixture.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: migration-setup.mjs <outDir>");
const cleanup = [];
const fixture = legacyFixture({ onTestFinished: (fn) => cleanup.push(fn) });
try {
  mkdirSync(resolve(out), { recursive: true });
  cpSync(fixture.target, join(out, "snapshot"), { recursive: true });
  writeFileSync(join(out, "opening.json"), openingItemsFile().bytes);
  console.log("snapshot", join(out, "snapshot"));
} finally {
  for (const fn of cleanup) fn();
}
