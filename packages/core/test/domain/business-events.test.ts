import { expect, it } from "vitest";
import {
  compilePostingRules,
  type PostingRule,
  type BusinessMaster,
} from "../../src/domain/index.ts";
it("matches indexed exact/group/all scopes on both axes, rejects ties and incomparable winners, and respects active windows", () => {
  const service: BusinessMaster = {
    code: "S",
    name: "Service",
    group: "G",
    active: true,
    revision: 1,
    dimensions: {},
  };
  const party = { ...service, code: "P", group: "PG" };
  const rule = (code: string, changes: Partial<PostingRule> = {}): PostingRule => ({
    code,
    revision: 1,
    active: true,
    direction: "receive",
    meaning: "offset",
    objectScope: "all",
    objectCode: "*",
    partyScope: "all",
    partyCode: "*",
    account: "4000",
    dimensions: {},
    from: "2026-01-01",
    to: "2026-12-31",
    ...changes,
  });
  const all = rule("ALL"),
    group = rule("GROUP", { objectScope: "group", objectCode: "G" }),
    exact = rule("EXACT", { objectScope: "exact", objectCode: "S" });
  const partyExact = rule("PARTY", { partyScope: "exact", partyCode: "P" });
  const cases = [
    { rules: [all, group, exact], winner: "EXACT" },
    { rules: [all, group], winner: "GROUP" },
    { rules: [all, { ...exact, active: false }], winner: "ALL" },
    { rules: [all, { ...exact, from: "2026-01-16" }], winner: "ALL" },
    { rules: [all, { ...exact, from: "2026-01-15", to: "2026-01-15" }], winner: "EXACT" },
    { rules: [all, exact, partyExact], error: "ambiguous" },
    { rules: [exact, { ...exact, code: "DUPLICATE" }], error: "ambiguous" },
    {
      rules: [
        exact,
        partyExact,
        rule("BOTH", {
          objectScope: "exact",
          objectCode: "S",
          partyScope: "exact",
          partyCode: "P",
        }),
      ],
      winner: "BOTH",
    },
    { rules: [{ ...all, meaning: "cash" as const }], error: "missing" },
    { rules: [{ ...all, direction: "pay" as const }], error: "missing" },
  ];
  for (const scenario of cases) {
    const compiled = compilePostingRules(scenario.rules, "2026-01-15");
    if ("error" in scenario)
      expect(() => compiled.match("receive", "offset", service, party)).toThrow(
        expect.objectContaining({ issue: expect.objectContaining({ rule: scenario.error }) }),
      );
    else
      expect(compiled.match("receive", "offset", service, party).rule.code).toBe(scenario.winner);
  }
  expect(
    compilePostingRules([all, partyExact], "2026-01-15").match("receive", "offset", service, null)
      .rule.code,
  ).toBe("ALL");
});
