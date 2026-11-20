// Demo v0.4.0 准备脚本（只用虚构数据）：在已迁移的新账套上初始化公司与财年，并建立贸易所需的六个控制科目。
// 用法：node docs/demo/v0.4.0/scripts/prepare.mjs <账套.sqlite> <财年>
// 之后的贸易配置、伙伴、订单、发票由 seed-trade.mjs 通过 HTTP API 建立。
import { MasterDataService } from "../../../../packages/core/src/application/index.ts";
import { createMasterDataStore } from "../../../../packages/infra/src/storage/master-data.ts";

const [filename, year] = process.argv.slice(2);
if (!filename || !year) throw new Error("usage: prepare.mjs <db.sqlite> <fiscal-year>");
const store = createMasterDataStore({ filename });
try {
  const master = new MasterDataService(store);
  await master.initialize(Number(year));
  for (const [code, category, reportGroup, controlModule] of [
    ["2100", "LIABILITY", "payables", "AP"],
    ["1250", "ASSET", "prepayments", "AP"],
    ["1300", "ASSET", "receivables", "AR"],
    ["2300", "LIABILITY", "otherLiabilities", "AR"],
    ["1400", "ASSET", "otherAssets", "TAX"],
    ["2200", "LIABILITY", "taxLiabilities", "TAX"],
  ])
    await master.saveAccount(
      "DEFAULT",
      {
        code,
        name: `虚构 ${code}`,
        category,
        reportGroup,
        controlModule,
        purpose: "control",
        normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
        contraOf: null,
        active: true,
        manualAllowed: false,
      },
      0,
    );
  console.log("prepared", filename, year);
} finally {
  await store.close();
}
