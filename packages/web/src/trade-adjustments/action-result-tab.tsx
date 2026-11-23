import type { TradeActionPreviewDto, TradeActionReceiptDto } from "@erp/core/contracts";
import { FastTab } from "../ui/components/index.tsx";
import type { Key, Money, T } from "./action-draft.ts";
import type { usePreviewLines } from "./use-action-entry.ts";

type Result = TradeActionPreviewDto | TradeActionReceiptDto;
type PreviewLines = ReturnType<typeof usePreviewLines>;

function head(t: T, keys: Key[]) {
  return (
    <thead>
      <tr>
        {keys.map((key) => (
          <th key={key}>{t(key)}</th>
        ))}
      </tr>
    </thead>
  );
}

function ChangesTable({ t, money, result }: { t: T; money: Money; result: Result }) {
  return (
    <div className="grid-wrap">
      <table className="grid tadj-changes">
        {head(t, [
          "tset.item",
          "trpt.kind",
          "tset.remaining",
          "tinv.net",
          "tinv.tax",
          "tadj.revision",
          "tadj.status",
        ])}
        <tbody>
          {result.changes.map(({ after }) => (
            <tr key={after.itemId}>
              <td>{after.itemId}</td>
              <td>{t(`tadj.${after.kind}`)}</td>
              <td>{money(after.remainingGross)}</td>
              <td>{money(after.remainingNet)}</td>
              <td>{money(after.remainingTax)}</td>
              <td>v{after.revision}</td>
              <td>{t(`tadj.${after.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreditLinesTable({ t, money, result }: { t: T; money: Money; result: Result }) {
  return (
    <div className="grid-wrap">
      <table className="grid tadj-credit">
        {head(t, ["tadj.sourceLine", "tinv.quantity", "tinv.net", "tinv.tax"])}
        <tbody>
          {result.creditLines.map((line) => (
            <tr key={line.sourceLineId}>
              <td>{line.sourceLineId}</td>
              <td>{line.quantity}</td>
              <td>{money(line.net)}</td>
              <td>{money(line.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JournalPreviewTable({ t, money, lines }: { t: T; money: Money; lines: PreviewLines }) {
  return (
    <div className="grid-wrap">
      <table className="grid tadj-journal" aria-label={t("tinv.previewTitle")}>
        {head(t, ["journal.account", "journal.debit", "journal.credit", "journal.dimensions"])}
        <tbody>
          {lines.map(({ id, line }) => (
            <tr key={id}>
              <td>{line.account}</td>
              <td>{money(line.debit)}</td>
              <td>{money(line.credit)}</td>
              <td>
                {Object.entries(line.dimensions)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActionResultTab({
  t,
  money,
  result,
  preview,
  previewLines,
}: {
  t: T;
  money: Money;
  result: Result;
  preview: TradeActionPreviewDto | null;
  previewLines: PreviewLines;
}) {
  return (
    <FastTab id="tadj-result" title={t("tadj.result")}>
      <section className="tadj-result" aria-label={t("tadj.result")}>
        <dl className="kpis">
          <div className="kpi emphasis">
            <dt className="label">{t(`tadj.${result.kind}`)}</dt>
            <dd className="value">{money(result.gross)}</dd>
          </div>
        </dl>
        <ChangesTable t={t} money={money} result={result} />
        {result.creditLines.length > 0 && <CreditLinesTable t={t} money={money} result={result} />}
        {preview && <JournalPreviewTable t={t} money={money} lines={previewLines} />}
        <p className="tadj-links">
          {t("tadj.links")}: {result.links.join(", ")}
        </p>
      </section>
    </FastTab>
  );
}
