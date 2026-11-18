import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  accountCommandSchema,
  accountFieldsSchema,
  accountSchema,
  accountsPageSchema,
  companiesPageSchema,
  type AccountCommand,
  type AccountDto,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Language, type Preferences } from "./ui/index.ts";
import { MasterDataFailure, masterRequest } from "./master-data-client.ts";

type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
function failure(error: unknown): "master.error" | "master.invalid" | "master.conflict" {
  return error instanceof MasterDataFailure && error.status === 409
    ? "master.conflict"
    : error instanceof MasterDataFailure && error.kind === "invalid"
      ? "master.invalid"
      : "master.error";
}
const groups = {
  ASSET: ["cash", "receivables", "inventory", "prepayments", "fixedAssets", "otherAssets"],
  LIABILITY: ["payables", "taxLiabilities", "otherLiabilities"],
  EQUITY: ["capital", "retainedEarnings", "otherEquity"],
  REVENUE: ["sales", "otherRevenue"],
  EXPENSE: ["costOfSales", "operatingExpense", "otherExpense"],
} as const;
const fresh = (company: string): AccountCommand => ({
  company,
  code: "",
  name: "",
  category: "ASSET",
  reportGroup: "cash",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  revision: 0,
});
export function Accounts({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [selected, setSelected] = useState<string>();
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = items.find((item) => item.code === (selected ?? items[0]?.code));
  if (companies.isPending) return <p role="status">{t("master.loading")}</p>;
  if (companies.isError)
    return (
      <section role="alert">
        <p>{t(failure(companies.error))}</p>
        <button type="button" onClick={() => void companies.refetch()}>
          {t("master.retry")}
        </button>
      </section>
    );
  return (
    <section>
      <h2>{t("master.title")}</h2>
      <label htmlFor="master-company">{t("master.company")}</label>
      <select
        id="master-company"
        value={company?.code ?? ""}
        onChange={(event) => setSelected(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.code} value={item.code}>
            {item.code} · {item.name}
          </option>
        ))}
      </select>
      {companies.hasNextPage && (
        <button
          type="button"
          disabled={companies.isFetchingNextPage}
          onClick={() => void companies.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {company && (
        <CompanyAccounts key={company.code} company={company} language={preferences.language} />
      )}
      {preferences.teaching && <p className="teaching">{t("master.teaching")}</p>}
    </section>
  );
}
function CompanyAccounts({ company, language }: { company: CompanyDto; language: Language }) {
  const t: T = (key) => label(language, key);
  const client = useQueryClient();
  const [editing, setEditing] = useState<AccountCommand | null>(null);
  const accounts = useInfiniteQuery({
    queryKey: ["accounts", company.code],
    refetchOnMount: true,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/accounts?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        accountsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = accounts.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <button type="button" onClick={() => setEditing(fresh(company.code))}>
        {t("master.new")}
      </button>
      {accounts.isPending && <p role="status">{t("master.loading")}</p>}
      {accounts.isError && (
        <p role="alert">
          {t(failure(accounts.error))}
          <button type="button" onClick={() => void accounts.refetch()}>
            {t("master.retry")}
          </button>
        </p>
      )}
      {accounts.data && (
        <AccountRows
          rows={rows}
          company={company}
          t={t}
          edit={(account) =>
            setEditing({
              company: company.code,
              code: account.code,
              name: account.name,
              category: account.category,
              reportGroup: account.reportGroup,
              normalSide: account.normalSide,
              purpose: account.purpose,
              controlModule: account.controlModule,
              contraOf: account.contraOf,
              manualAllowed: account.manualAllowed,
              active: account.active,
              revision: account.revision,
            })
          }
        />
      )}
      {accounts.hasNextPage && (
        <button
          type="button"
          disabled={accounts.isFetchingNextPage}
          onClick={() => void accounts.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {editing && (
        <AccountEditor
          key={`${editing.code}:${editing.revision}`}
          initial={editing}
          t={t}
          cancel={() => setEditing(null)}
          saved={() => {
            setEditing(null);
            void client.invalidateQueries({ queryKey: ["accounts", company.code] });
          }}
        />
      )}
    </>
  );
}
function AccountRows({
  rows,
  company,
  t,
  edit,
}: {
  rows: readonly AccountDto[];
  company: CompanyDto;
  t: T;
  edit: (account: AccountDto) => void;
}) {
  const scroll = useRef<HTMLElement>(null);
  const virtual = rows.length > 100;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ account: rows[item.index], index: item.index }))
    : rows.map((account, index) => ({ account, index }));
  const before = virtual ? (measured[0]?.start ?? 0) : 0;
  const after = virtual ? virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0) : 0;
  return (
    <section
      ref={scroll}
      className="accounts-scroll"
      aria-label={t("master.title")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual scroll regions must stay keyboard-focusable.
      tabIndex={0}
    >
      <table aria-label={t("master.title")} aria-rowcount={rows.length + 1}>
        <thead>
          <tr>
            {(
              [
                "master.code",
                "master.name",
                "master.category",
                "master.active",
                "master.edit",
              ] as const
            ).map((key) => (
              <th key={key} scope="col">
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty native spacer rows contain no focus targets.
            <tr aria-hidden="true">
              <td colSpan={5} style={{ height: before, padding: 0 }} />
            </tr>
          )}
          {visible.map(({ account, index }) => (
            <tr key={account.code} aria-rowindex={index + 2} style={{ height: 44 }}>
              <td>{account.code}</td>
              <td>
                {account.name}
                {account.builtin && <small> · {t("master.builtin")}</small>}
              </td>
              <td>{t(`master.category.${account.category}`)}</td>
              <td>
                <input
                  type="checkbox"
                  checked={account.active}
                  disabled
                  aria-label={`${t("master.active")} ${account.code}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={account.builtin && company.closeMode === "monthly-teaching"}
                  title={
                    account.builtin && company.closeMode === "monthly-teaching"
                      ? t("master.readonly")
                      : undefined
                  }
                  onClick={() => edit(account)}
                  aria-label={`${t("master.edit")} ${account.code}`}
                >
                  {t("master.edit")}
                </button>
              </td>
            </tr>
          ))}
          {after > 0 && (
            // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty native spacer rows contain no focus targets.
            <tr aria-hidden="true">
              <td colSpan={5} style={{ height: after, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && <p>{t("master.empty")}</p>}
    </section>
  );
}
function AccountEditor({
  initial,
  t,
  cancel,
  saved,
}: {
  initial: AccountCommand;
  t: T;
  cancel: () => void;
  saved: () => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      operation.current++;
      controller.current?.abort();
    },
    [],
  );
  function patch(change: Partial<AccountCommand>) {
    setDraft((value) => ({ ...value, ...change }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = accountCommandSchema.safeParse(draft);
    if (!parsed.success) {
      setError(new MasterDataFailure("invalid"));
      return;
    }
    const id = ++operation.current;
    controller.current = new AbortController();
    setBusy(true);
    setError(undefined);
    try {
      await masterRequest("/api/v1/accounts", accountSchema, {
        method: draft.revision === 0 ? "POST" : "PUT",
        body: parsed.data,
        signal: controller.current.signal,
      });
      if (operation.current === id) saved();
    } catch (issue) {
      if (operation.current === id) setError(issue);
    } finally {
      if (operation.current === id) setBusy(false);
      else void client.invalidateQueries({ queryKey: ["accounts", initial.company] });
    }
  }
  const changeChoice = <
    K extends "category" | "reportGroup" | "normalSide" | "purpose" | "controlModule",
  >(
    key: K,
    value: string,
  ) => {
    const parsed = accountFieldsSchema.shape[key].safeParse(value);
    if (!parsed.success) {
      setError(new MasterDataFailure("invalid"));
      return;
    }
    if (key === "category") {
      const category = accountFieldsSchema.shape.category.parse(value);
      patch({
        category,
        reportGroup: groups[category][0],
        normalSide: ["ASSET", "EXPENSE"].includes(category) ? "DEBIT" : "CREDIT",
      });
    } else if (key === "purpose") {
      const purpose = accountFieldsSchema.shape.purpose.parse(value);
      patch({
        purpose,
        controlModule: purpose === "control" ? "AP" : null,
        ...(purpose === "control" ? { manualAllowed: false } : {}),
      });
    } else patch({ [key]: parsed.data });
  };
  return (
    <form className="account-editor" onSubmit={(event) => void submit(event)}>
      <h3>{t(initial.revision === 0 ? "master.new" : "master.edit")}</h3>
      <fieldset disabled={busy}>
        <label htmlFor="account-code">{t("master.code")}</label>
        <input
          id="account-code"
          value={draft.code}
          disabled={initial.revision !== 0}
          required
          pattern="[1-9][0-9]{3}"
          onChange={(event) => patch({ code: event.target.value })}
        />
        <label htmlFor="account-name">{t("master.name")}</label>
        <input
          id="account-name"
          value={draft.name}
          required
          maxLength={80}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <label htmlFor="account-category">{t("master.category")}</label>
        <select
          id="account-category"
          value={draft.category}
          onChange={(event) => changeChoice("category", event.target.value)}
        >
          {accountFieldsSchema.shape.category.options.map((value) => (
            <option key={value} value={value}>
              {t(`master.category.${value}`)}
            </option>
          ))}
        </select>
        <label htmlFor="account-report">{t("master.reportGroup")}</label>
        <select
          id="account-report"
          value={draft.reportGroup}
          onChange={(event) => changeChoice("reportGroup", event.target.value)}
        >
          {groups[draft.category].map((value) => (
            <option key={value} value={value}>
              {t(`master.report.${value}`)}
            </option>
          ))}
        </select>
        <label htmlFor="account-side">{t("master.normalSide")}</label>
        <select
          id="account-side"
          value={draft.normalSide}
          onChange={(event) => changeChoice("normalSide", event.target.value)}
        >
          {accountFieldsSchema.shape.normalSide.options.map((value) => (
            <option key={value} value={value}>
              {t(`master.side.${value}`)}
            </option>
          ))}
        </select>
        <label htmlFor="account-purpose">{t("master.purpose")}</label>
        <select
          id="account-purpose"
          value={draft.purpose}
          onChange={(event) => changeChoice("purpose", event.target.value)}
        >
          {accountFieldsSchema.shape.purpose.options.map((value) => (
            <option key={value} value={value}>
              {t(`master.purpose.${value}`)}
            </option>
          ))}
        </select>
        {draft.purpose === "control" && (
          <>
            <label htmlFor="account-module">{t("master.controlModule")}</label>
            <select
              id="account-module"
              value={draft.controlModule ?? "AP"}
              onChange={(event) => changeChoice("controlModule", event.target.value)}
            >
              {accountFieldsSchema.shape.controlModule.unwrap().options.map((value) => (
                <option key={value} value={value}>
                  {t(`master.module.${value}`)}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="account-contra">{t("master.contraOf")}</label>
        <input
          id="account-contra"
          value={draft.contraOf ?? ""}
          placeholder={t("master.none")}
          pattern="[1-9][0-9]{3}"
          onChange={(event) => patch({ contraOf: event.target.value || null })}
        />
        <label>
          <input
            type="checkbox"
            checked={draft.manualAllowed}
            disabled={draft.purpose === "control"}
            onChange={(event) => patch({ manualAllowed: event.target.checked })}
          />
          {t("master.manualAllowed")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => patch({ active: event.target.checked })}
          />
          {t("master.active")}
        </label>
        <button type="submit">{t(busy ? "master.saving" : "master.save")}</button>
      </fieldset>
      <button type="button" onClick={cancel}>
        {t("master.cancel")}
      </button>
      {error !== undefined && (
        <div role="alert">
          <p>{t(failure(error))}</p>
          {failure(error) === "master.conflict" && (
            <button type="button" onClick={saved}>
              {t("master.reload")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
