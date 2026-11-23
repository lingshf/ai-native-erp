import type { AccountDto, JournalDraftDto } from "@erp/core/contracts";
import { MasterDataFailure } from "../master-data-client.ts";
import { Badge, FastTab, MessageBar } from "../ui/components/index.tsx";
import { DimensionFields } from "./dialogs.tsx";
import type { T as Translate } from "./dialogs.tsx";
import { MAX_JOURNAL_LINES, type lineTotals } from "./journal-draft.ts";
import {
  addLine,
  lineKeyDown,
  patchLine,
  removeLine,
  type JournalContext,
} from "./journal-commands.ts";
import type { JournalLookups } from "./use-journal-lookups.ts";

type JournalLine = JournalDraftDto["lines"][number];
type LineTableProps = {
  journal: JournalContext;
  draft: JournalDraftDto;
  accountItems: readonly AccountDto[];
  dimensionKeys: string[];
  totals: ReturnType<typeof lineTotals>;
  t: Translate;
};
const LINE_COLUMNS = [
  "journal.line",
  "journal.account",
  "journal.debit",
  "journal.credit",
  "journal.dimensions",
] as const;
const SUSPENSE_FIELDS = ["owner", "reason", "reviewDate"] as const;

export function LookupError({ retry, t }: { retry: () => void; t: Translate }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("journal.error")}{" "}
      <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}
export function JournalLinesTab(props: LineTableProps & { accounts: JournalLookups["accounts"] }) {
  const { journal, draft, accountItems, accounts, totals, t } = props;
  return (
    <FastTab
      id="journal-lines"
      title={t("journal.tabLines")}
      summary={
        totals.balanced ? undefined : <Badge tone="warning">{t("journal.unbalanced")}</Badge>
      }
    >
      <datalist id={`journal-accounts-${journal.company.code}`}>
        {accountItems
          .filter((account) => account.active && account.manualAllowed)
          .map((account) => (
            <option key={account.code} value={account.code}>
              {account.name}
            </option>
          ))}
      </datalist>
      {accounts.isError && <LookupError retry={() => void accounts.refetch()} t={t} />}
      {accounts.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void accounts.fetchNextPage()}
        >
          {t("master.loadMore")} {t("journal.account")}
        </button>
      )}
      <JournalLineTable {...props} />
      <button
        type="button"
        className="btn btn-secondary jv-add"
        disabled={draft.lines.length >= MAX_JOURNAL_LINES}
        onClick={() => addLine(journal)}
      >
        {t("journal.add")}
      </button>
    </FastTab>
  );
}
function JournalLineTable(props: LineTableProps) {
  const { journal, draft, totals, t } = props;
  return (
    <div className="grid-wrap jv-lines">
      <table className="grid" aria-label={t("journal.drafts")}>
        <thead>
          <tr>
            {LINE_COLUMNS.map((key) => (
              <th
                key={key}
                scope="col"
                className={key === "journal.debit" || key === "journal.credit" ? "num" : undefined}
              >
                {t(key)}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => (
            <JournalLineRow
              key={journal.lineKeys.current[index]}
              {...props}
              line={line}
              index={index}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              {t("journal.total")}
            </th>
            <td className="num">{totals.debit}</td>
            <td className="num">{totals.credit}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
function needsSuspense(line: JournalLine, index: number, props: LineTableProps) {
  const { error } = props.journal;
  return (
    props.accountItems.find((account) => account.code === line.account)?.purpose === "suspense" ||
    line.suspense !== null ||
    (error instanceof MasterDataFailure &&
      error.detail?.fieldErrors.some(
        (issue) =>
          issue.path.startsWith(`lines.${index}.suspense`) &&
          issue.messageKey === "api.error.journals.suspense",
      ))
  );
}
function JournalLineRow(props: LineTableProps & { line: JournalLine; index: number }) {
  const { journal, draft, dimensionKeys, line, index, t } = props;
  const patch = (value: Partial<JournalLine>) => patchLine(journal, draft.lines, index, value);
  const lineLabel = `${t("journal.line")} ${index + 1}`;
  return (
    <tr onKeyDown={(event) => lineKeyDown(journal, event, index)}>
      <th scope="row">{index + 1}</th>
      <td>
        <input
          data-account={index}
          aria-label={`${lineLabel} ${t("journal.account")}`}
          list={`journal-accounts-${journal.company.code}`}
          value={line.account}
          onChange={(event) => patch({ account: event.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={`${lineLabel} ${t("journal.debit")}`}
          inputMode="decimal"
          value={line.debit}
          onChange={(event) => patch({ debit: event.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={`${lineLabel} ${t("journal.credit")}`}
          inputMode="decimal"
          value={line.credit}
          onChange={(event) => patch({ credit: event.target.value })}
        />
      </td>
      <td>
        <DimensionFields
          keys={dimensionKeys}
          value={line.dimensions}
          title={lineLabel}
          change={(value) => patch({ dimensions: value })}
        />
        {needsSuspense(line, index, props) && <SuspenseFields line={line} patch={patch} t={t} />}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          onClick={() => removeLine(journal, draft.lines, index)}
        >
          {t("journal.remove")} {index + 1}
        </button>
      </td>
    </tr>
  );
}
function SuspenseFields({
  line,
  patch,
  t,
}: {
  line: JournalLine;
  patch: (value: Partial<JournalLine>) => void;
  t: Translate;
}) {
  return (
    <fieldset>
      <legend className="jv-legend">{t("journal.rule.suspense")}</legend>
      {SUSPENSE_FIELDS.map((field) => (
        <label key={field}>
          {t(`journal.${field}`)}
          <input
            type={field === "reviewDate" ? "date" : "text"}
            value={line.suspense?.[field] ?? ""}
            onChange={(event) =>
              patch({
                suspense: {
                  owner: "",
                  reason: "",
                  reviewDate: "",
                  ...line.suspense,
                  [field]: event.target.value,
                },
              })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
