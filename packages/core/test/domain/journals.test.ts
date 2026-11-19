import { expect, it } from "vitest";
import { buildJournalPlan, defaultAccounts, type JournalDraft } from "@erp/core/domain";

it("grants only the adapter's control modules, retains other account guards, and validates all three dates", () => {
  const draft: JournalDraft = {
    id: "00000001-0000-4000-8000-000000000001",
    revision: 0,
    sourceRef: "DOMAIN",
    date: "2026-01-15",
    documentDate: "2025-12-29",
    taxDate: "2026-03-01",
    memo: "Controlled",
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [
      { account: "1000", debit: "1", credit: "", dimensions: {}, suspense: null },
      { account: "3000", debit: "", credit: "1", dimensions: {}, suspense: null },
    ],
  };
  const accounts = defaultAccounts().map((account) =>
    account.code === "1000"
      ? {
          ...account,
          purpose: "control" as const,
          controlModule: "AP" as const,
          manualAllowed: false,
        }
      : account,
  );
  const input: Parameters<typeof buildJournalPlan>[0] = {
    draft,
    company: {
      code: "DEFAULT",
      name: "Local",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
      revision: 1,
    },
    accounts,
    period: { month: "2026-01", status: "open", revision: 1 },
    catalog: [],
    original: null,
    corrections: [],
    turnover: 0,
  };
  expect(() => buildJournalPlan(input)).toThrow(
    expect.objectContaining({
      code: "INVALID_INPUT",
      issue: { scope: "journals", path: "lines.0.account", rule: "manual" },
    }),
  );
  expect(() =>
    buildJournalPlan({
      ...input,
      adapter: { module: "TEST_AR", controlModules: ["AR"] },
    }),
  ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  const adapter = { module: "TEST_AP", controlModules: ["AP"] as const };
  expect(buildJournalPlan({ ...input, adapter })).toMatchObject({
    date: draft.date,
    documentDate: draft.documentDate,
    taxDate: draft.taxDate,
    module: "TEST_AP",
    journals: [{ debit: 100, credit: 100 }],
  });
  for (const changed of [
    { ...accounts[0], active: false },
    { ...accounts[0], purpose: "general" as const, controlModule: null, manualAllowed: false },
  ]) {
    expect(() =>
      buildJournalPlan({
        ...input,
        adapter,
        accounts: [changed, ...accounts.slice(1)],
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  }
  for (const field of ["documentDate", "taxDate"] as const)
    expect(() =>
      buildJournalPlan({
        ...input,
        adapter,
        draft: { ...draft, [field]: "2026-02-30" },
      }),
    ).toThrow(
      expect.objectContaining({
        issue: { scope: "journals", path: field, rule: "shape" },
      }),
    );
});
