import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companiesPageSchema,
  dimensionPageSchema,
  dimensionConfigSchema,
  dimensionWriteSchema,
  type DimensionCommand,
  type DimensionDto,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/master.css";
type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
type Kind = DimensionCommand["kind"];
const kinds = ["dimension", "value", "structure", "defaults", "derivation", "balance"] as const;
const rules = [
  "shape",
  "reference",
  "window",
  "duplicate",
  "cycle",
  "conflict",
  "required",
  "forbidden",
  "combination",
  "balance",
] as const;
type Failure = { path: string; key: Exclude<LabelKey, "shell.httpError">; conflict: boolean };
function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    if (error.status === 409 && error.detail?.code === "CONFLICT")
      return { path: "form", key: "master.conflict", conflict: true };
    const field = error.detail?.fieldErrors[0];
    const rule = rules.find((value) => field?.messageKey === `api.error.dimensions.${value}`);
    if (rule && field) return { path: field.path, key: `dim.issue.${rule}`, conflict: false };
    if (error.status === 400 || error.kind === "invalid")
      return { path: "form", key: "dim.issue.shape", conflict: false };
  }
  return { path: "form", key: "master.error", conflict: false };
}
function Notice({ error, t, retry }: { error: unknown; t: T; retry: () => void }) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t(failure(error).key)}</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}
export function Dimensions({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [selected, setSelected] = useState("");
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = rows.find((item) => item.code === (selected || rows[0]?.code));
  return (
    <section className="page ui-master dimensions">
      <PageHeader
        title={t("dim.title")}
        context={
          companies.data && (
            <>
              <div className="field">
                <label htmlFor="dimension-company">{t("master.company")}</label>
                <select
                  id="dimension-company"
                  value={company?.code ?? ""}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {rows.map((item) => (
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
          )
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("dim.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <Notice error={companies.error} t={t} retry={() => void companies.refetch()} />
      )}
      {company && <CompanyDimensions key={company.code} company={company} t={t} />}
    </section>
  );
}
function usePage(company: string, kind: Kind, dimension: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["dimensions", company, kind, dimension],
    initialPageParam: "",
    enabled,
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/dimensions?company=${encodeURIComponent(company)}&kind=${kind}&limit=100${dimension ? `&dimension=${encodeURIComponent(dimension)}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        dimensionPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
function CompanyDimensions({ company, t }: { company: CompanyDto; t: T }) {
  const [kind, setKind] = useState<Kind>("dimension"),
    [dimension, setDimension] = useState("");
  const definitions = usePage(company.code, "dimension", "", kind === "value");
  return (
    <>
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="dimension-kind">{t("dim.kind")}</label>
          <select
            id="dimension-kind"
            value={kind}
            onChange={(event) => {
              const next = kinds.find((value) => value === event.target.value);
              if (next) setKind(next);
            }}
          >
            {kinds.map((item) => (
              <option key={item} value={item}>
                {t(`dim.${item}`)}
              </option>
            ))}
          </select>
        </div>
        {kind === "value" && (
          <>
            <div className="field">
              <label htmlFor="dimension-parent">{t("dim.parent")}</label>
              <select
                id="dimension-parent"
                value={dimension}
                onChange={(event) => setDimension(event.target.value)}
              >
                <option value="">{t("dim.choose")}</option>
                {definitions.data?.pages
                  .flatMap((page) => page.items)
                  .map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code}
                    </option>
                  ))}
              </select>
            </div>
            {definitions.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={definitions.isFetchingNextPage}
                onClick={() => void definitions.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        )}
      </div>
      {kind === "value" && definitions.isError && (
        <Notice error={definitions.error} t={t} retry={() => void definitions.refetch()} />
      )}
      {kind === "value" && !dimension && <p className="ui-master-note">{t("dim.emptyParent")}</p>}
      {(kind !== "value" || dimension) && (
        <DimensionPane
          key={`${kind}:${dimension}`}
          company={company}
          kind={kind}
          dimension={kind === "value" ? dimension : ""}
          t={t}
        />
      )}
    </>
  );
}
function DimensionPane({
  company,
  kind,
  dimension,
  t,
}: {
  company: CompanyDto;
  kind: Kind;
  dimension: string;
  t: T;
}) {
  const [editing, setEditing] = useState<DimensionDto | null | undefined>();
  const page = usePage(company.code, kind, dimension);
  const rows = page.data?.pages.flatMap((value) => value.items) ?? [];
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
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  const before = virtual ? (measured[0]?.start ?? 0) : 0,
    after = virtual ? virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0) : 0;
  return (
    <>
      <div className="ui-master-actions">
        <button
          type="button"
          className={`btn ${editing === undefined ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setEditing(null)}
        >
          {t("dim.new")}
        </button>
      </div>
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && <Notice error={page.error} t={t} retry={() => void page.refetch()} />}
      <div className="card">
        <section
          className="grid-wrap ui-master-scroll"
          ref={scroll}
          aria-label={t(`dim.${kind}`)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list must support keyboard scrolling.
          tabIndex={0}
        >
          <table className="grid" aria-label={t(`dim.${kind}`)} aria-rowcount={rows.length + 1}>
            <thead>
              <tr>
                {(["dim.identifier", "dim.name", "master.active", "dim.edit"] as const).map(
                  (key) => (
                    <th key={key} scope="col">
                      {t(key)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {before > 0 && (
                // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty spacer row has no focusable content.
                <tr aria-hidden="true">
                  <td colSpan={4} style={{ height: before, padding: 0 }} />
                </tr>
              )}
              {visible.map(({ row, index }) => (
                <tr key={row.code} aria-rowindex={index + 2} style={{ height: 44 }}>
                  <td>{row.code}</td>
                  <td>{"name" in row ? row.name : t(`dim.${row.kind}`)}</td>
                  <td>
                    <label className="ui-master-hit">
                      <input
                        type="checkbox"
                        checked={row.active}
                        disabled
                        aria-label={`${t("master.active")} ${row.code}`}
                      />
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-subtle btn-sm"
                      aria-label={`${t("dim.edit")} ${row.code}`}
                      onClick={() => setEditing(row)}
                    >
                      {t("dim.edit")}
                    </button>
                  </td>
                </tr>
              ))}
              {after > 0 && (
                // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty spacer row has no focusable content.
                <tr aria-hidden="true">
                  <td colSpan={4} style={{ height: after, padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          {page.data && rows.length === 0 && <p className="empty-state">{t("dim.empty")}</p>}
        </section>
      </div>
      {page.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary ui-master-more"
          disabled={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {editing !== undefined && (
        <DimensionEditor
          key={editing ? `${editing.code}:${editing.revision}` : "new"}
          company={company}
          kind={kind}
          dimension={dimension}
          initial={editing}
          t={t}
          close={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
const specific = {
  dimension: ["name"],
  value: ["name"],
  defaults: ["values"],
  derivation: ["when", "values", "mode"],
  structure: ["required", "optional", "forbidden", "allowed", "fixed", "conditionals"],
  balance: ["dimension", "account"],
} as const;
const arrays = new Set(["required", "optional", "forbidden"]);
const jsonFields = new Set(["values", "when", "allowed", "fixed", "conditionals"]);
function DimensionEditor({
  company,
  kind,
  dimension,
  initial,
  t,
  close,
}: {
  company: CompanyDto;
  kind: Kind;
  dimension: string;
  initial: DimensionDto | null;
  t: T;
  close: () => void;
}) {
  const client = useQueryClient();
  const fields = ["code", "from", "to", ...specific[kind]] as const;
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const value: Record<string, string> = {
      code: kind === "balance" ? "LEDGER" : "",
      from: `${company.year}-01-01`,
      to: `${company.year}-12-31`,
      active: "true",
    };
    for (const field of specific[kind])
      value[field] = jsonFields.has(field)
        ? field === "allowed" || field === "conditionals"
          ? "[]"
          : "{}"
        : "";
    if (initial)
      for (const [key, item] of Object.entries(initial))
        value[key] =
          arrays.has(key) && Array.isArray(item)
            ? item.join(",")
            : item !== null && typeof item === "object"
              ? JSON.stringify(item)
              : String(item);
    return value;
  });
  const [error, setError] = useState<Failure | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const raw: Record<string, unknown> = {
      kind,
      revision: initial?.revision ?? 0,
      active: draft.active === "true",
      ...(kind === "value" ? { dimension } : {}),
    };
    for (const field of fields) {
      try {
        raw[field] = arrays.has(field)
          ? draft[field]
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : jsonFields.has(field)
            ? JSON.parse(draft[field])
            : draft[field];
      } catch (issue) {
        if (!(issue instanceof SyntaxError)) throw issue;
        setError({ path: field, key: "dim.issue.shape", conflict: false });
        return;
      }
    }
    const parsed = dimensionWriteSchema.safeParse({ company: company.code, config: raw });
    if (!parsed.success) {
      setError({
        path: parsed.error.issues[0]?.path.filter((key) => key !== "config").join(".") || "form",
        key: "dim.issue.shape",
        conflict: false,
      });
      return;
    }
    const id = ++generation.current;
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    let accepted = false;
    try {
      await masterRequest("/api/v1/dimensions", dimensionConfigSchema, {
        method: initial ? "PUT" : "POST",
        body: parsed.data,
        signal: controller.current.signal,
      });
      accepted = true;
      if (generation.current === id) close();
    } catch (issue) {
      if (generation.current === id) setError(failure(issue));
    } finally {
      if (generation.current === id) setBusy(false);
      if (accepted || generation.current !== id)
        void client.invalidateQueries({ queryKey: ["dimensions", company.code] });
    }
  }
  const fieldLabel = (field: (typeof fields)[number]): Exclude<LabelKey, "shell.httpError"> =>
    `dim.${field}`;
  return (
    <form className="ui-master-editor" onSubmit={(event) => void submit(event)}>
      <FastTab
        id="dim-editor"
        title={t("dim.editor")}
        summary={initial ? `${t("dim.edit")} · ${initial.code}` : t("dim.new")}
      >
        <fieldset disabled={busy} className="ui-form-grid">
          {fields.map((field) => {
            const options = field === "mode" ? (["fill", "replace"] as const) : null;
            const invalid = error?.path.split(".")[0] === field;
            const props = {
              id: `dim-${field}`,
              value: draft[field],
              onChange: (event: { target: { value: string } }) =>
                setDraft((value) => ({ ...value, [field]: event.target.value })),
              "aria-invalid": invalid ? (true as const) : undefined,
              "aria-describedby": invalid
                ? `dim-${field}-error`
                : field === "allowed"
                  ? "dim-allowed-hint"
                  : undefined,
            };
            return (
              <div
                key={field}
                className={`ui-field${jsonFields.has(field) ? " ui-master-wide" : ""}`}
              >
                <label htmlFor={`dim-${field}`}>{t(fieldLabel(field))}</label>
                {options ? (
                  <select {...props} required>
                    <option value="">{t("dim.choose")}</option>
                    {options.map((value) => (
                      <option key={value} value={value}>
                        {t(`dim.${value}`)}
                      </option>
                    ))}
                  </select>
                ) : jsonFields.has(field) ? (
                  <textarea {...props} required rows={3} maxLength={64000} />
                ) : (
                  <input
                    {...props}
                    type={field === "from" || field === "to" ? "date" : "text"}
                    required={!arrays.has(field)}
                    disabled={field === "code" && (initial !== null || kind === "balance")}
                    maxLength={arrays.has(field) ? 1055 : field === "name" ? 80 : 128}
                  />
                )}
                {field === "allowed" && (
                  <p id="dim-allowed-hint" className="ui-hint">
                    {t("dim.allowedHint")}
                  </p>
                )}
                {invalid && (
                  <p id={`dim-${field}-error`} className="ui-master-error" role="alert">
                    {error.path}: {t(error.key)}
                  </p>
                )}
              </div>
            );
          })}
          <label className="ui-check">
            <input
              type="checkbox"
              checked={draft.active === "true"}
              onChange={(event) =>
                setDraft((value) => ({ ...value, active: String(event.target.checked) }))
              }
            />
            {t("master.active")}
          </label>
          {fields.some((field) => jsonFields.has(field)) && (
            <p className="ui-hint ui-master-wide">{t("dim.jsonHint")}</p>
          )}
          <div className="ui-form-actions ui-master-wide">
            <button type="submit" className="btn btn-primary">
              {t(busy ? "master.saving" : "dim.save")}
            </button>
          </div>
        </fieldset>
        <div className="ui-form-actions">
          <button type="button" className="btn btn-subtle" onClick={close}>
            {t("master.cancel")}
          </button>
          {error?.conflict && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void client.invalidateQueries({ queryKey: ["dimensions", company.code] });
                close();
              }}
            >
              {t("master.reload")}
            </button>
          )}
        </div>
        {error && !fields.some((field) => field === error.path.split(".")[0]) && (
          <MessageBar tone="danger" role="alert">
            {error.path}: {t(error.key)}
          </MessageBar>
        )}
      </FastTab>
    </form>
  );
}
