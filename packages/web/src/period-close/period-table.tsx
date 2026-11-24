import type { PeriodDto } from "@erp/core/contracts";
import { Badge } from "../ui/components/index.tsx";
import type { CloseText } from "./close-text.ts";

export function PeriodTable({
  t,
  months,
  selectedPeriod,
}: {
  t: CloseText;
  months: PeriodDto[];
  selectedPeriod: PeriodDto | undefined;
}) {
  return (
    <div className="card">
      <div className="grid-wrap">
        <table className="grid">
          <caption>{t("close.periods")}</caption>
          <thead>
            <tr>
              {(["ledger.period", "tadj.status"] as const).map((key) => (
                <th key={key} scope="col">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((item) => (
              <tr key={item.month} aria-current={item.month === selectedPeriod?.month}>
                <td>{item.month}</td>
                <td>
                  <Badge tone={tones[item.status]}>{t(`close.status.${item.status}`)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const tones = { open: "info", frozen: "warning", closed: "success" } as const;
