import type { ClosePreviewDto, CompanyDto, PeriodDto } from "@erp/core/contracts";

export function closeSource(
  {
    company,
    period,
    preview,
  }: { company: CompanyDto; period: PeriodDto; preview: ClosePreviewDto | null },
  account?: string,
) {
  if (!preview) throw new Error("Missing close preview");
  const scope = {
    company: company.code,
    month: period.month,
    stage: "adjusted",
    watermark: String(preview.snapshot.watermark),
    accountRevision: String(preview.snapshot.accountRevision),
  };
  return account && account !== "3100"
    ? `/ledger?${new URLSearchParams({ ...scope, account })}`
    : `/ledger-reports?${new URLSearchParams({ ...scope, view: "trial" })}`;
}
