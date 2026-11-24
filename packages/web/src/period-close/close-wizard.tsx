import type { CompanyDto, PeriodDto } from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import { CloseActionBar } from "./close-action-bar.tsx";
import { closeSource } from "./close-links.ts";
import { CloseErrorBar, ClosedNotice } from "./close-notices.tsx";
import { ClosePreviewCard } from "./close-preview.tsx";
import { useCloseCommands } from "./use-close-commands.ts";

export function CloseWizard({
  company,
  period,
  preferences,
  setLocked,
  next,
}: {
  company: CompanyDto;
  period: PeriodDto;
  preferences: Preferences;
  setLocked: (locked: boolean) => void;
  next: (month: string) => void;
}) {
  const commands = useCloseCommands({ company, period, setLocked, next });
  const { preview, result, pending, busy, error } = commands;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(preferences.language, key);
  const latestPeriod = result?.period ?? period;
  const fmt = (value: number) => formatMinor(value, preferences.language, company.scale);
  const source = (account?: string) => closeSource({ company, period, preview }, account);
  const closedView = result || latestPeriod.status !== "open";
  const working = busy || pending !== null;
  return (
    <>
      <CloseActionBar
        t={t}
        company={company}
        period={period}
        latestPeriod={latestPeriod}
        working={working}
        closedView={closedView}
        commands={commands}
      />
      {busy && <p role="status">{t("master.loading")}</p>}
      {error !== null && <CloseErrorBar t={t} pending={pending} />}
      {closedView && <ClosedNotice t={t} company={company} result={result} />}
      {preview && (
        <ClosePreviewCard t={t} preview={preview} pending={pending} fmt={fmt} source={source} />
      )}
    </>
  );
}
