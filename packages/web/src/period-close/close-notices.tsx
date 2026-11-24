import { Link } from "react-router-dom";
import type { CompanyDto, CloseResultDto } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { Pending } from "./close-commands.ts";
import type { CloseText } from "./close-text.ts";

export function CloseErrorBar({ t, pending }: { t: CloseText; pending: Pending | null }) {
  return (
    <MessageBar tone={pending ? "warning" : "danger"} role="alert">
      {t(pending ? "close.unknown" : "close.error")}
    </MessageBar>
  );
}

export function ClosedNotice({
  t,
  company,
  result,
}: {
  t: CloseText;
  company: CompanyDto;
  result: CloseResultDto | null;
}) {
  return (
    <MessageBar tone="info">
      <p>{t("close.closed")}</p>
      {result?.receipt.journalIds.map((id) => (
        <p key={id}>
          <Link to={`/journals?${new URLSearchParams({ company: company.code, id })}`}>{id}</Link>
        </p>
      ))}
    </MessageBar>
  );
}
