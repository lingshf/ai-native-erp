import { describe, expect, it } from "vitest";
import {
  assertTradeAccount,
  selectTradeTax,
  validateTradeConfig,
  type Account,
  type TradeConfig,
} from "../../src/domain/index.ts";
import { tradeWriteSchema } from "../../src/contracts/index.ts";

const window = { name: "Trade", from: "2026-01-01", to: "2026-12-31" };
const base = { code: "A", active: true, revision: 1 };
const ordinary: TradeConfig<"taxCode"> = {
  ...base,
  kind: "taxCode",
  code: "VAT",
  data: {
    ...window,
    mode: "ordinary",
    deductiblePercent: "75.123456",
    inputAccount: "1400",
    outputAccount: "2200",
    rates: [
      { id: "R1", from: window.from, to: "2026-06-30", ratePercent: "12" },
      { id: "R2", from: "2026-07-01", to: window.to, ratePercent: "10.000001" },
    ],
  },
};
const party: TradeConfig<"tradeParty"> = {
  ...base,
  kind: "tradeParty",
  data: {
    ...window,
    role: "both",
    apProfile: "AP",
    arProfile: "AR",
    terms: "NET30",
    allowedTaxCodes: ["VAT", "ZERO"],
    defaultDimensions: {},
  },
};
const product: TradeConfig<"tradeProduct"> = {
  ...base,
  kind: "tradeProduct",
  data: {
    ...window,
    type: "expense",
    expenseAccount: "5000",
    revenueAccount: null,
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  },
};
const terms: TradeConfig<"tradeTerms"> = {
  ...base,
  kind: "tradeTerms",
  data: {
    ...window,
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  },
};
const account: Account = {
  code: "1000",
  name: "Account",
  category: "ASSET",
  reportGroup: "cash",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  active: true,
  manualAllowed: true,
  revision: 1,
  builtin: false,
};
describe("FR-T01 trade master rules", () => {
  it("accepts each supported shape, roles and inclusive adjacent rate windows", () => {
    for (const config of [ordinary, party, product, terms])
      expect(() => validateTradeConfig(config)).not.toThrow();
    for (const role of ["vendor", "customer", "both"] as const)
      expect(() =>
        validateTradeConfig({
          ...party,
          data: {
            ...party.data,
            role,
            apProfile: role === "customer" ? null : "AP",
            arProfile: role === "vendor" ? null : "AR",
          },
        }),
      ).not.toThrow();
    expect(() =>
      validateTradeConfig({
        ...product,
        data: { ...product.data, type: "service", expenseAccount: null, revenueAccount: "4000" },
      }),
    ).not.toThrow();
    expect(selectTradeTax(party, product, [ordinary], "2026-06-30").rate.id).toBe("R1");
    expect(selectTradeTax(party, product, [ordinary], "2026-07-01").rate.id).toBe("R2");
  });
  it.each([
    { dueDays: -1 },
    { dueDays: 3651 },
    { dueDays: 1.5 },
    { discountDays: 31 },
    { discountDays: -1 },
    { discountPercent: "100.000001" },
    { discountPercent: "1.1234567" },
    { discountPercent: "-1" },
    { discountPercent: "1e1" },
    { from: "2026-02-30" },
    { to: "2025-12-31" },
  ])("rejects invalid payment terms %j", (change) => {
    expect(() => validateTradeConfig({ ...terms, data: { ...terms.data, ...change } })).toThrow();
  });
  it.each(["0", "0.000001", "100", "100.000000"])(
    "accepts exact percent boundary %s",
    (discountPercent) => {
      expect(() =>
        validateTradeConfig({ ...terms, data: { ...terms.data, discountPercent } }),
      ).not.toThrow();
    },
  );
  it("rejects wrong-role references, stock products and redundant accounting roles", () => {
    expect(() =>
      validateTradeConfig({ ...party, data: { ...party.data, role: "vendor" } }),
    ).toThrow();
    expect(() =>
      validateTradeConfig({ ...product, data: { ...product.data, revenueAccount: "4000" } }),
    ).toThrow();
    expect(() =>
      validateTradeConfig({ ...party, data: { ...party.data, allowedTaxCodes: ["VAT", "VAT"] } }),
    ).toThrow();
    const { revision: _productRevision, ...productCommand } = product;
    for (const data of [
      { ...product.data, type: "stock" },
      { ...product.data, group: "UNUSED" },
    ])
      expect(
        tradeWriteSchema.safeParse({
          company: "DEFAULT",
          ...productCommand,
          expectedRevision: 0,
          data,
        }).success,
      ).toBe(false);
    const { revision: _, ...command } = terms;
    expect(
      tradeWriteSchema.safeParse({
        ...command,
        company: "DEFAULT",
        expectedRevision: 0,
        data: { ...terms.data, group: "G" },
      }).success,
    ).toBe(false);
    const numericPercent = { ...terms.data, discountPercent: 1.5 };
    expect(
      tradeWriteSchema.safeParse({
        ...command,
        company: "DEFAULT",
        expectedRevision: 0,
        data: numericPercent,
      }).success,
    ).toBe(false);
  });
  it("keeps ordinary, zero and exempt explicit and rejects overlap, duplicate IDs and invalid accounts", () => {
    for (const mode of ["zero", "exempt"] as const) {
      const tax: TradeConfig<"taxCode"> = {
        ...ordinary,
        data: {
          ...ordinary.data,
          mode,
          inputAccount: null,
          outputAccount: null,
          rates: [{ id: "ZERO", from: window.from, to: window.to, ratePercent: "0" }],
        },
      };
      expect(() => validateTradeConfig(tax)).not.toThrow();
      expect(() =>
        validateTradeConfig({ ...tax, data: { ...tax.data, rates: ordinary.data.rates } }),
      ).toThrow();
    }
    for (const rates of [
      [ordinary.data.rates[0], { ...ordinary.data.rates[1], from: "2026-06-30" }],
      [ordinary.data.rates[0], { ...ordinary.data.rates[1], id: "R1" }],
      [{ ...ordinary.data.rates[0], from: "2025-12-31" }],
      [],
    ])
      expect(() =>
        validateTradeConfig({ ...ordinary, data: { ...ordinary.data, rates } }),
      ).toThrow();
    expect(() =>
      validateTradeConfig({
        ...ordinary,
        data: { ...ordinary.data, inputAccount: null, outputAccount: null },
      }),
    ).toThrow();
    expect(() =>
      validateTradeConfig({ ...ordinary, data: { ...ordinary.data, deductiblePercent: "101" } }),
    ).toThrow();
  });
  it("requires the tax intersection and exactly one effective rate without treating missing tax as exemption", () => {
    const zero: TradeConfig<"taxCode"> = {
      ...ordinary,
      code: "ZERO",
      data: {
        ...ordinary.data,
        mode: "zero",
        inputAccount: null,
        outputAccount: null,
        rates: [{ id: "R", from: window.from, to: window.to, ratePercent: "0" }],
      },
    };
    expect(selectTradeTax(party, product, [ordinary, zero], "2026-04-01").tax.code).toBe("VAT");
    const both = { ...product, data: { ...product.data, allowedTaxCodes: ["VAT", "ZERO"] } };
    expect(() => selectTradeTax(party, both, [ordinary, zero], "2026-04-01")).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ rule: "ambiguousTax" }) }),
    );
    expect(selectTradeTax(party, both, [ordinary, zero], "2026-04-01", "ZERO").tax.data.mode).toBe(
      "zero",
    );
    for (const taxes of [
      [],
      [{ ...ordinary, active: false }],
      [{ ...ordinary, data: { ...ordinary.data, rates: [] } }],
    ])
      expect(() => selectTradeTax(party, product, taxes, "2026-04-01")).toThrow(
        expect.objectContaining({ issue: expect.objectContaining({ rule: "missingTax" }) }),
      );
    expect(() => selectTradeTax(party, product, [ordinary, zero], "2026-04-01", "ZERO")).toThrow();
    expect(() => selectTradeTax(party, product, [ordinary], "2027-01-01")).toThrow();
  });
  it.each([
    ["controlAccount", "AP", "LIABILITY", "payables", "AP"],
    ["controlAccount", "AR", "ASSET", "receivables", "AR"],
    ["advanceAccount", "AP", "ASSET", "prepayments", "AP"],
    ["advanceAccount", "AR", "LIABILITY", "otherLiabilities", "AR"],
    ["inputAccount", undefined, "ASSET", "otherAssets", "TAX"],
    ["outputAccount", undefined, "LIABILITY", "taxLiabilities", "TAX"],
  ] as const)(
    "validates %s %s by category, module, report group and active state",
    (role, side, category, reportGroup, controlModule) => {
      const valid: Account = {
        ...account,
        category,
        reportGroup,
        controlModule,
        purpose: "control",
        manualAllowed: false,
        normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
      };
      expect(() => assertTradeAccount(valid, role, side)).not.toThrow();
      for (const invalid of [
        null,
        { ...valid, active: false },
        { ...valid, controlModule: "BANK" as const },
        { ...valid, category: "EXPENSE" as const },
        { ...valid, purpose: "general" as const },
        { ...valid, contraOf: "1500" },
        { ...valid, manualAllowed: true },
      ])
        expect(() => assertTradeAccount(invalid, role, side)).toThrow();
    },
  );
  it("accepts only ordinary cash assets and appropriate expense/revenue accounts", () => {
    expect(() => assertTradeAccount(account, "cashAccount")).not.toThrow();
    for (const invalid of [
      { ...account, purpose: "control" as const, controlModule: "BANK" as const },
      { ...account, reportGroup: "prepayments" as const },
      { ...account, purpose: "clearing" as const },
      { ...account, normalSide: "CREDIT" as const },
    ])
      expect(() => assertTradeAccount(invalid, "cashAccount")).toThrow();
    const revenue: Account = {
      ...account,
      category: "REVENUE",
      reportGroup: "sales",
      normalSide: "CREDIT",
    };
    for (const role of ["discountAccount", "revenueAccount"] as const) {
      expect(() => assertTradeAccount(revenue, role)).not.toThrow();
      expect(() => assertTradeAccount(account, role)).toThrow();
    }
    expect(() =>
      assertTradeAccount(
        { ...account, category: "EXPENSE", reportGroup: "operatingExpense" },
        "expenseAccount",
      ),
    ).not.toThrow();
  });
});
