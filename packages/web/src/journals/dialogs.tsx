import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CompanyDto, JournalEntryDto } from "@erp/core/contracts";
import type { LabelKey, Language } from "../ui/index.ts";
import { MasterDataFailure } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { VirtualRows } from "./virtual-rows.tsx";
export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export function DimensionFields({
  keys,
  value,
  title,
  change,
}: {
  keys: string[];
  value: Record<string, string | null>;
  title: string;
  change: (value: Record<string, string | null>) => void;
}) {
  return (
    <div className="journal-dimensions">
      {keys.map((key) => (
        <label key={key} className="ui-field">
          <span className="label">
            {title} {key}
          </span>
          <input
            value={value[key] === null ? "-" : (value[key] ?? "")}
            onChange={(event) => {
              const next = { ...value };
              if (event.target.value === "") delete next[key];
              else next[key] = event.target.value === "-" ? null : event.target.value;
              change(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
export function Modal({
  title,
  children,
  busy,
  close,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      ref={ref}
      className="journal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (!busy) close();
        }
        if (event.key === "Tab") {
          const nodes = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex='0']",
            ),
          );
          const first = nodes[0],
            last = nodes.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === ref.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === ref.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <h3>{title}</h3>
      {children}
    </dialog>
  );
}
export function JournalError({
  error,
  t,
  uncertain,
}: {
  error: unknown;
  t: T;
  uncertain: boolean;
}) {
  const issue = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : undefined;
  const rule = issue?.messageKey.split(".").at(-1);
  const rules = [
    "shape",
    "money",
    "balance",
    "balanceAccount",
    "dimensionLimit",
    "account",
    "manual",
    "suspense",
    "period",
    "source",
    "correction",
    "amount",
    "businessSource",
  ] as const;
  const key = rules.find((value) => value === rule);
  const fields = [
    ["account", "journal.account"],
    ["debit", "journal.debit"],
    ["credit", "journal.credit"],
    ["dimensions", "journal.dimensions"],
    ["date", "journal.date"],
    ["documentDate", "journal.documentDate"],
    ["taxDate", "journal.taxDate"],
    ["sourceRef", "journal.sourceRef"],
    ["owner", "journal.owner"],
    ["reason", "journal.reason"],
    ["reviewDate", "journal.reviewDate"],
    ["balance", "journal.balance"],
  ] as const;
  const message = uncertain
    ? t("journal.network")
    : rule === "stale" || (error instanceof MasterDataFailure && error.status === 409 && !issue)
      ? t("journal.stale")
      : issue?.messageKey.startsWith("api.error.dimensions.")
        ? t("journal.rule.dimensions")
        : key
          ? t(`journal.rule.${key}`)
          : error instanceof MasterDataFailure && error.status === 400
            ? t("journal.invalid")
            : t("journal.error");
  return (
    <MessageBar tone="danger" role="alert">
      {message}
      {issue && (
        <span>
          {" "}
          ·{" "}
          {issue.path
            .replace(
              /^lines\.(\d+)/u,
              (_, value: string) => `${t("journal.line")} ${Number(value) + 1}`,
            )
            .split(".")
            .map((part) => {
              const field = fields.find(([name]) => name === part);
              return field ? t(field[1]) : part;
            })
            .join(" · ")}
        </span>
      )}
    </MessageBar>
  );
}
export function Facts({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="jv-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function LinePlan({
  lines,
  company,
  language,
  t,
  total,
}: {
  lines: JournalEntryDto["lines"];
  company: CompanyDto;
  language: Language;
  t: T;
  total?: { debit: number; credit: number };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <div className="card jv-plan">
        <VirtualRows
          className="jv-rows"
          items={lines}
          title={t("journal.previewTitle")}
          header={[
            t("journal.account"),
            t("journal.debit"),
            t("journal.credit"),
            t("journal.dimensions"),
            "",
          ]}
          footer={
            total && (
              <tr>
                <th scope="row">{t("journal.total")}</th>
                <td className="num">{formatMinor(total.debit, language, company.scale)}</td>
                <td className="num">{formatMinor(total.credit, language, company.scale)}</td>
                <td colSpan={2} />
              </tr>
            )
          }
          render={(line, index) => (
            <>
              <td>
                {line.account} · {t(`journal.${line.role}`)}
              </td>
              <td className="num">{formatMinor(line.debit, language, company.scale)}</td>
              <td className="num">{formatMinor(line.credit, language, company.scale)}</td>
              <td>
                {Object.entries(line.dimensions)
                  .map(([key, value]) => `${key}=${value ?? "-"}`)
                  .join(" · ")}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => setSelected(index)}
                >
                  {t("journal.details")} {index + 1}
                </button>
              </td>
            </>
          )}
        />
      </div>
      {selected !== null && lines[selected] && (
        <aside aria-label={t("journal.details")}>
          <h4>
            {t("journal.line")} {selected + 1}
          </h4>
          {Object.entries(lines[selected].dimensionOrigins).map(([key, origins]) => (
            <p key={key}>
              {key}:{" "}
              {origins.map((origin) => `${origin.source} → ${origin.value ?? "-"}`).join(" · ")}
            </p>
          ))}
          {lines[selected].historical && (
            <p>
              {t("journal.historical")}: {lines[selected].historical.entryId} /{" "}
              {lines[selected].historical.lineNo}
            </p>
          )}
          {lines[selected].balancing && (
            <p>
              {t("journal.balance")}: {lines[selected].balancing.dimension}=
              {lines[selected].balancing.value} ·{" "}
              {formatMinor(lines[selected].balancing.businessNet, language, company.scale)}
            </p>
          )}
        </aside>
      )}
    </>
  );
}
