import {
  accountSchema,
  reportWatermarkQuerySchema,
  type CompanyDto,
  type PeriodDto,
} from "@erp/core/contracts";
import { views } from "./types.ts";

export function isValidReportParams({
  params,
  months,
  month,
  view,
  stage,
  account,
}: {
  params: URLSearchParams;
  months: PeriodDto[];
  month: string | undefined;
  view: string;
  stage: string;
  account: string;
}) {
  return (
    months.some((item) => item.month === month) &&
    views.some((item) => item === view) &&
    ["unadjusted", "adjusted", "postClosing"].includes(stage) &&
    /^[1-9]\d{3}$/u.test(account) &&
    [...params.keys()].every(
      (key) =>
        [
          "company",
          "month",
          "view",
          "stage",
          "account",
          "group",
          "dimension",
          "value",
          "watermark",
          "accountRevision",
        ].includes(key) && params.getAll(key).length === 1,
    ) &&
    params.has("dimension") === params.has("value") &&
    params.has("watermark") === params.has("accountRevision") &&
    (!params.has("watermark") ||
      reportWatermarkQuerySchema.safeParse(params.get("watermark")).success) &&
    (!params.has("accountRevision") ||
      reportWatermarkQuerySchema.safeParse(params.get("accountRevision")).success) &&
    (!params.get("group") || accountSchema.shape.reportGroup.safeParse(params.get("group")).success)
  );
}

export function reportSearch(
  company: CompanyDto,
  month: string | undefined,
  stage: string,
  params: URLSearchParams,
) {
  const search = new URLSearchParams({ company: company.code, month: month ?? "", stage });
  if (params.has("watermark")) search.set("watermark", params.get("watermark") ?? "");
  if (params.has("accountRevision"))
    search.set("accountRevision", params.get("accountRevision") ?? "");
  return search;
}
