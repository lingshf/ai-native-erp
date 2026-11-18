import { describe, expect, it } from "vitest";
import {
  assertAccountRelationships,
  changedPeriod,
  checkedAccount,
  checkedCompany,
  checkedExpectedRevision,
  type Account,
  type AccountInput,
} from "../../src/domain/index.ts";

const gross: Account = {
  code: "1500",
  name: "Equipment",
  category: "ASSET",
  reportGroup: "fixedAssets",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  active: true,
  manualAllowed: true,
  revision: 1,
  builtin: false,
};
describe("unified master data rules", () => {
  it("validates company currency precision, fiscal year and closing mode", () => {
    const company = {
      code: "A",
      name: " Alpha ",
      currency: "EUR",
      scale: 2,
      year: 2026,
      closeMode: "annual" as const,
    };
    expect(checkedCompany(company).name).toBe("Alpha");
    for (const change of [
      { code: "lower" },
      { currency: "eur" },
      { scale: 1.5 },
      { scale: 5 },
      { year: 9999 },
      { closeMode: "other" },
      { name: "\n" },
    ]) {
      expect(() => checkedCompany({ ...company, ...change } as typeof company)).toThrow();
    }
  });
  it("rejects mismatched report groups and incoherent control/manual fields", () => {
    for (const change of [
      { reportGroup: "sales" },
      { purpose: "control", controlModule: null },
      { controlModule: "AP" },
      { purpose: "control", controlModule: "AP", manualAllowed: true },
      { code: "0150" },
      { name: "X\nY" },
    ]) {
      expect(() => checkedAccount({ ...gross, ...change } as AccountInput)).toThrow();
    }
    expect(
      checkedAccount({ ...gross, purpose: "control", controlModule: "AP", manualAllowed: false })
        .purpose,
    ).toBe("control");
    expect(() => checkedExpectedRevision(Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it("requires opposite-side same-category gross parents, no self-links or chains, and protects existing children", () => {
    const contra: Account = {
      ...gross,
      code: "1590",
      name: "Depreciation",
      contraOf: gross.code,
      normalSide: "CREDIT",
    };
    expect(() => assertAccountRelationships(contra, gross, [])).not.toThrow();
    for (const parent of [
      null,
      { ...gross, category: "EXPENSE" as const },
      { ...gross, normalSide: "CREDIT" as const },
      { ...gross, contraOf: "1000" },
    ]) {
      expect(() => assertAccountRelationships(contra, parent, [])).toThrow();
    }
    expect(() => checkedAccount({ ...contra, contraOf: contra.code })).toThrow();
    expect(() =>
      assertAccountRelationships({ ...gross, normalSide: "CREDIT" }, null, [contra]),
    ).toThrow();
    expect(() =>
      assertAccountRelationships({ ...gross, purpose: "clearing" }, null, [contra]),
    ).toThrow();
  });
  it("allows freeze/reopen but requires explicit permanent close and forbids reopening a closed period", () => {
    const open = { month: "2026-01", status: "open" as const, revision: 1 };
    const frozen = changedPeriod(open, "frozen", "Review", false);
    expect(changedPeriod(frozen, "open", "Reviewed", false)).toMatchObject({
      status: "open",
      revision: 3,
    });
    expect(() => changedPeriod(open, "closed", "Close", false)).toThrow();
    expect(() => changedPeriod(open, "frozen", " ", false)).toThrow();
    const closed = changedPeriod(open, "closed", "Close", true);
    expect(() => changedPeriod(closed, "open", "Reopen", true)).toThrow();
  });
});
