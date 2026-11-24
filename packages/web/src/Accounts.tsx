import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  accountsPageSchema,
  companiesPageSchema,
  type AccountCommand,
  type AccountDto,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type Language, type Preferences } from "./ui/index.ts";
import { masterRequest } from "./master-data-client.ts";
import { Badge, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/accounts.css";
import { AccountEditor } from "./accounts/account-editor.tsx";
import { failure, type T } from "./accounts/account-messages.ts";

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
      <section role="alert" className="message-bar danger">
        <p className="text">{t(failure(companies.error))}</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void companies.refetch()}
        >
          {t("master.retry")}
        </button>
      </section>
    );
  return (
    <section className="page accounts">
      <PageHeader
        title={t("master.title")}
        description={t("master.description")}
        context={
          <>
            <div className="field">
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
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={companies.isFetchingNextPage}
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("master.teaching")}
      </TeachingTip>
      {company && (
        <CompanyAccounts key={company.code} company={company} language={preferences.language} />
      )}
    </section>
  );
}
// TLIST-03: "Refresh list" only re-reads the list, so it stays enabled while the editor is open.
function AccountActions({
  editing,
  onNew,
  onRefresh,
  t,
}: {
  editing: boolean;
  onNew: () => void;
  onRefresh: () => void;
  t: T;
}) {
  return (
    <div className="acct-actions">
      <button
        type="button"
        className={`btn ${editing ? "btn-secondary" : "btn-primary"}`}
        onClick={onNew}
      >
        {t("master.new")}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onRefresh}>
        {t("master.listRefresh")}
      </button>
    </div>
  );
}
function CompanyAccounts({ company, language }: { company: CompanyDto; language: Language }) {
  const t: T = (key) => label(language, key);
  const client = useQueryClient();
  const [editing, setEditing] = useState<AccountCommand | null>(null);
  const queryKey = ["accounts", company.code];
  const refresh = () => void client.resetQueries({ queryKey, exact: true });
  const accounts = useInfiniteQuery({
    queryKey,
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
      <AccountActions
        editing={editing !== null}
        onNew={() => setEditing(fresh(company.code))}
        onRefresh={refresh}
        t={t}
      />
      {accounts.isPending && <p role="status">{t("master.loading")}</p>}
      {accounts.isError && (
        <p role="alert" className="message-bar danger">
          <span className="text">{t(failure(accounts.error))}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void accounts.refetch()}
          >
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
          className="btn btn-secondary acct-more"
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
            void client.invalidateQueries({ queryKey });
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
    <div className="card">
      <section
        ref={scroll}
        className="grid-wrap acct-scroll"
        aria-label={t("master.title")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual scroll regions must stay keyboard-focusable.
        tabIndex={0}
      >
        <table className="grid" aria-label={t("master.title")} aria-rowcount={rows.length + 1}>
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
                  {account.builtin && (
                    <small className="acct-builtin"> · {t("master.builtin")}</small>
                  )}
                </td>
                <td>{t(`master.category.${account.category}`)}</td>
                <td>
                  {account.active ? (
                    <Badge tone="success">{t("master.active")}</Badge>
                  ) : (
                    <span className="badge">{t("master.inactive")}</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
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
        {rows.length === 0 && <p className="empty-state">{t("master.empty")}</p>}
      </section>
    </div>
  );
}
