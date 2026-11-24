import type { PostingRuleDto } from "@erp/core/contracts";

export type RuleScope = PostingRuleDto["objectScope"];

export const newPostingRule = (year: number): PostingRuleDto => ({
  code: "",
  revision: 0,
  active: true,
  direction: "receive",
  meaning: "cash",
  objectScope: "exact",
  objectCode: "",
  partyScope: "all",
  partyCode: "*",
  account: "",
  dimensions: {},
  from: `${year}-01-01`,
  to: `${year}-12-31`,
});

export function scopeChange(scope: string): { scope: RuleScope; code: string } | undefined {
  if (scope === "exact" || scope === "group" || scope === "all")
    return { scope, code: scope === "all" ? "*" : "" };
  return undefined;
}
