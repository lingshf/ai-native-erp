import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  tradeOrderCommandSchema,
  tradeOrderPreviewSchema,
  tradeOrderSchema,
  tradePageSchema,
  type CompanyDto,
  type TradeDto,
  type TradeOrderPreviewDto,
} from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import type { OrderFilter } from "../trade-order-link.ts";
import { Badge, FastTab, MessageBar } from "../ui/components/index.tsx";
import { type T, type Order, type Guard, type Opened, idleGuard } from "./order-model.ts";
import {
  type Command,
  type Draft,
  type Failure,
  numeric,
  blankLine,
  blankDraft,
  toCommand,
  stablePath,
  ruleKey,
} from "./order-draft.ts";
import { OrderList } from "./order-list.tsx";
import { OrderLookup } from "./order-lookup.tsx";
import { OrderView } from "./order-view.tsx";
const lineFields = ["product", "taxCode", "quantity", "unitPrice", "discountPercent"] as const;
const amountKeys = ["net", "tax", "gross"] as const;
function useOptions(company: string, kind: TradeDto["kind"]) {
  return useQuery({
    queryKey: ["trade-order-options", company, kind],
    refetchOnMount: true,
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/${kind}?company=${encodeURIComponent(company)}&limit=500`,
        tradePageSchema,
        { signal },
      ),
  });
}

export function OrderWorkspace({
  company,
  preferences,
  t,
  onGuard,
  linkOrder,
  params,
  onFilter,
  onLink,
  onBack,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
  linkOrder: string | null;
  params: URLSearchParams;
  onFilter: (filter: OrderFilter) => void;
  onLink: (orderId: string | null) => void;
  // Recovery from a bad order link removes `order` and names this company (TORD-07 rule 3).
  onBack: () => void;
}) {
  const language = preferences.language;
  const [draft, setDraft] = useState(blankDraft);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<"save" | "preview" | null>(null);
  const busy = working !== null;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const [preview, setPreview] = useState<TradeOrderPreviewDto | null>(null);
  // Focus after a preview request ends: the result region on success, the Preview button on failure.
  const [previewFocus, setPreviewFocus] = useState<{ to: "result" | "button" } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // The address owns the opened order (TINV-03): a list click or lookup writes `order`, and every
  // change of `order` (click, deep link, Back) runs the lookup; a link or Back focuses the result.
  const focusNext = useRef(true);
  useEffect(() => {
    setOpened(linkOrder === null ? null : { orderId: linkOrder, focus: focusNext.current });
    focusNext.current = true;
  }, [linkOrder]);
  const open = (orderId: string, focus: boolean) => {
    if (orderId === linkOrder) setOpened({ orderId, focus });
    else {
      focusNext.current = focus;
      onLink(orderId);
    }
  };
  const client = useQueryClient();
  const savedNotice = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const previewResult = useRef<HTMLElement>(null);
  const parties = useOptions(company.code, "tradeParty");
  const products = useOptions(company.code, "tradeProduct");
  const taxes = useOptions(company.code, "taxCode");
  useLayoutEffect(() => onGuard({ busy, unsaved: dirty }), [onGuard, busy, dirty]);
  useLayoutEffect(() => () => onGuard(idleGuard), [onGuard]);
  // Layout effect: focus moves inside the commit, so the notice never appears with focus elsewhere (D92).
  useLayoutEffect(() => {
    if (saved) savedNotice.current?.focus();
  }, [saved]);
  useLayoutEffect(() => {
    if (previewFocus)
      (previewFocus.to === "result" ? previewResult : previewButton).current?.focus();
  }, [previewFocus]);
  const money = (value: number) => formatMinor(value, language, company.scale);
  const issueAt = (path: string) => failure?.issues.find((issue) => issue.path === path);

  const edit = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setDirty(true);
    setSaved(null);
    setPreview(null);
  };
  const editLine = (index: number, field: (typeof lineFields)[number], value: string) =>
    edit({
      lines: draft.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    });
  const addLine = () => {
    if (draft.lines.length >= 100) return;
    const used = new Set(draft.lines.map((line) => line.lineId));
    let n = draft.lines.length + 1;
    while (used.has(`L${n}`)) n += 1;
    edit({ lines: [...draft.lines, blankLine(n)] });
  };
  const removeLine = (lineId: string) => {
    edit({ lines: draft.lines.filter((line) => line.lineId !== lineId) });
    setFailure(
      (current) =>
        current && {
          ...current,
          issues: current.issues.filter(
            (issue) => issue.path !== `line:${lineId}` && !issue.path.startsWith(`line:${lineId}.`),
          ),
        },
    );
  };
  const discard = () => {
    if (busy || !window.confirm(t("tord.discardConfirm"))) return;
    setDraft(blankDraft());
    setDirty(false);
    setFailure(null);
    setPreview(null);
  };
  const failed = (
    error: unknown,
    lines: Command["lines"],
    invalid: TradeOrderKey,
    other: TradeOrderKey,
  ) => {
    const fields = error instanceof MasterDataFailure ? (error.detail?.fieldErrors ?? []) : [];
    const definite =
      error instanceof MasterDataFailure && error.kind === "http" && (error.status ?? 500) < 500;
    setFailure({
      message: fields.length ? t(invalid) : t(definite ? "tord.issue.other" : other),
      issues: fields.map((field) => ({
        path: stablePath(field.path, lines),
        key: ruleKey(field.messageKey),
      })),
      uncertain: !definite,
    });
  };
  const checkedCommand = (invalid: TradeOrderKey) => {
    const command = toCommand(company, draft);
    const checked = tradeOrderCommandSchema.safeParse(command);
    if (checked.success) return checked.data;
    setFailure({
      message: t(invalid),
      issues: checked.error.issues.map((issue) => ({
        path: stablePath(issue.path.join("."), command.lines),
        key: "tord.issue.shape",
      })),
      uncertain: false,
    });
    return null;
  };

  const runPreview = async () => {
    if (busy) return;
    const command = checkedCommand("tord.previewInvalid");
    if (!command) {
      setPreviewFocus({ to: "button" });
      return;
    }
    setWorking("preview");
    setFailure(null);
    setSaved(null);
    try {
      setPreview(
        await masterRequest("/api/v1/trade/orders/preview", tradeOrderPreviewSchema, {
          method: "POST",
          body: command,
        }),
      );
      setPreviewFocus({ to: "result" });
    } catch (error) {
      setPreview(null);
      failed(error, command.lines, "tord.previewInvalid", "tord.previewFailed");
      setPreviewFocus({ to: "button" });
    } finally {
      setWorking(null);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const command = checkedCommand("tord.invalid");
    if (!command) return;
    setWorking("save");
    setFailure(null);
    try {
      const order = await masterRequest("/api/v1/trade/orders", tradeOrderSchema, {
        method: "POST",
        body: command,
      });
      setSaved(order);
      setPreview(null);
      setDraft(blankDraft());
      setDirty(false);
      void client.resetQueries({ queryKey: ["trade-orders", company.code] });
    } catch (error) {
      failed(error, command.lines, "tord.invalid", "tord.uncertain");
    } finally {
      setWorking(null);
    }
  };

  const fieldLabel = (path: string) => {
    const line = /^line:(.+?)(?:\.([A-Za-z]+))?$/u.exec(path);
    if (line) {
      const [, lineId, field] = line;
      if (!field) return `${t("tord.lineId")} ${lineId}`;
      const known = (lineFields as readonly string[]).includes(field);
      return `${known ? t(`tord.${field}` as TradeOrderKey) : field} ${lineId}`;
    }
    const header = ["orderId", "side", "party", "currency", "orderDate", "rounding", "lines"];
    return header.includes(path) ? t(`tord.${path}` as TradeOrderKey) : "";
  };
  const errorProps = (path: string) => {
    const issue = issueAt(path);
    return issue
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `tord-error-${path.replaceAll(/[.:]/gu, "-")}`,
        }
      : {};
  };
  const errorText = (path: string) => {
    const issue = issueAt(path);
    return issue ? (
      <p className="ui-error-text" id={`tord-error-${path.replaceAll(/[.:]/gu, "-")}`}>
        {t(issue.key)}
      </p>
    ) : null;
  };
  const options = (query: ReturnType<typeof useOptions>, keep: (item: TradeDto) => boolean) =>
    (query.data?.items ?? []).filter((item) => item.active && keep(item));
  const partyOptions = options(
    parties,
    (item) =>
      item.kind === "tradeParty" &&
      (item.data.role === "both" ||
        item.data.role === (draft.side === "AP" ? "vendor" : "customer")),
  );
  const productOptions = options(
    products,
    (item) =>
      item.kind === "tradeProduct" &&
      item.data.type === (draft.side === "AP" ? "expense" : "service"),
  );
  const taxOptions = options(taxes, (item) => item.kind === "taxCode");
  const optionsFailed = parties.isError || products.isError || taxes.isError;
  const generalSummary = [
    draft.orderId.trim(),
    label(language, `trade.${draft.side}`),
    draft.party.trim(),
    draft.orderDate,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <form
        className="tord-entry"
        aria-label={t("tord.entry")}
        onSubmit={(event) => void save(event)}
      >
        <div className="tord-command-bar">
          <button
            ref={previewButton}
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runPreview()}
          >
            {t("tord.preview")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t("tord.save")}
          </button>
          <button
            type="button"
            className="btn btn-subtle"
            disabled={!dirty || busy}
            onClick={discard}
          >
            {t("tord.discard")}
          </button>
          <span className="tord-status">
            {busy ? (
              <span role="status">
                {t(working === "preview" ? "tord.previewing" : "tord.saving")}
              </span>
            ) : preview ? (
              <Badge tone="info">{t("tord.previewBadge")}</Badge>
            ) : (
              t("tord.amountsAfterSave")
            )}
          </span>
        </div>
        {failure && (
          <MessageBar tone={failure.uncertain ? "warning" : "danger"} role="alert">
            <p>{failure.message}</p>
            {failure.issues.length > 0 && (
              <ul>
                {failure.issues.map((issue) => (
                  <li key={`${issue.path}:${issue.key}`}>
                    {[fieldLabel(issue.path), t(issue.key)].filter(Boolean).join(": ")}
                  </li>
                ))}
              </ul>
            )}
          </MessageBar>
        )}
        {saved && (
          <div className="tord-saved" ref={savedNotice} tabIndex={-1}>
            <MessageBar tone="success" role="status">
              <p>
                {t("tord.saved", { orderId: saved.orderId })}{" "}
                <a href="#/trade-invoices">{t("tord.toInvoices")}</a>
              </p>
            </MessageBar>
          </div>
        )}
        {preview && (
          <section
            className="tord-lookup-result"
            ref={previewResult}
            tabIndex={-1}
            aria-labelledby="tord-preview-title"
          >
            <h4 id="tord-preview-title">
              {t("tord.previewTitle")} <Badge tone="info">{t("tord.previewBadge")}</Badge>
            </h4>
            <p className="ui-hint">{t("tord.previewNote")}</p>
            <dl className="kpis">
              {amountKeys.map((key) => (
                <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
                  <dt className="label">{t(`tord.${key}`)}</dt>
                  <dd className="value">{money(preview[key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {optionsFailed && (
          <MessageBar tone="warning">
            <p>{t("tord.optionsFailed")}</p>
          </MessageBar>
        )}
        <FastTab id="tord-general" title={t("tord.entry")} summary={generalSummary}>
          <fieldset disabled={busy} className="ui-form-grid">
            <div className="ui-field">
              <label htmlFor="tord-orderId">{t("tord.orderId")}</label>
              <input
                id="tord-orderId"
                maxLength={60}
                autoComplete="off"
                value={draft.orderId}
                onChange={(event) => edit({ orderId: event.target.value })}
                {...errorProps("orderId")}
              />
              {errorText("orderId") ?? <p className="ui-hint">{t("tord.codeHint")}</p>}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-side">{t("tord.side")}</label>
              <select
                id="tord-side"
                value={draft.side}
                onChange={(event) => edit({ side: event.target.value === "AR" ? "AR" : "AP" })}
              >
                <option value="AP">{label(language, "trade.AP")}</option>
                <option value="AR">{label(language, "trade.AR")}</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="tord-party">{t("tord.party")}</label>
              <input
                id="tord-party"
                list="tord-party-options"
                maxLength={60}
                autoComplete="off"
                value={draft.party}
                onChange={(event) => edit({ party: event.target.value })}
                {...errorProps("party")}
              />
              {errorText("party")}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-currency">{t("tord.currency")}</label>
              <input
                id="tord-currency"
                readOnly
                value={company.currency}
                {...errorProps("currency")}
              />
              {errorText("currency")}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-orderDate">{t("tord.orderDate")}</label>
              <input
                id="tord-orderDate"
                type="date"
                value={draft.orderDate}
                onChange={(event) => edit({ orderDate: event.target.value })}
                {...errorProps("orderDate")}
              />
              {errorText("orderDate")}
            </div>
            <label className="ui-check" htmlFor="tord-priceIncludesTax">
              <input
                id="tord-priceIncludesTax"
                type="checkbox"
                checked={draft.priceIncludesTax}
                onChange={(event) => edit({ priceIncludesTax: event.target.checked })}
              />
              {t("tord.priceIncludesTax")}
            </label>
            <div className="ui-field">
              <label htmlFor="tord-rounding">{t("tord.rounding")}</label>
              <select
                id="tord-rounding"
                value={draft.rounding}
                onChange={(event) =>
                  edit({ rounding: event.target.value === "document" ? "document" : "line" })
                }
              >
                <option value="line">{t("tord.roundingLine")}</option>
                <option value="document">{t("tord.roundingDocument")}</option>
              </select>
            </div>
          </fieldset>
        </FastTab>
        <FastTab
          id="tord-lines"
          title={t("tord.lines")}
          summary={t("tord.lineCount", { count: draft.lines.length })}
        >
          <fieldset disabled={busy} className="tord-lines">
            <div className="grid-wrap">
              <table className="grid" aria-label={t("tord.lines")}>
                <thead>
                  <tr>
                    <th scope="col">{t("tord.lineId")}</th>
                    {lineFields.map((field) => (
                      <th key={field} scope="col">
                        {t(`tord.${field}`)}
                      </th>
                    ))}
                    {preview &&
                      amountKeys.map((key) => (
                        <th key={key} scope="col" className="num">
                          {t(`tord.${key}`)}
                        </th>
                      ))}
                    <th scope="col">{t("tord.removeLine")}</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, index) => (
                    <tr key={line.lineId}>
                      <td>{line.lineId}</td>
                      {lineFields.map((field) => {
                        const path = `line:${line.lineId}.${field}`;
                        return (
                          <td key={field}>
                            <input
                              aria-label={`${t(`tord.${field}`)} ${line.lineId}`}
                              inputMode={numeric.has(field) ? "decimal" : "text"}
                              list={
                                field === "product"
                                  ? "tord-product-options"
                                  : field === "taxCode"
                                    ? "tord-tax-options"
                                    : undefined
                              }
                              autoComplete="off"
                              maxLength={60}
                              value={line[field]}
                              onChange={(event) => editLine(index, field, event.target.value)}
                              {...errorProps(path)}
                            />
                            {errorText(path)}
                          </td>
                        );
                      })}
                      {preview &&
                        amountKeys.map((key) => (
                          <td key={key} className="num">
                            {money(preview.lines[index][key])}
                          </td>
                        ))}
                      <td>
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          aria-label={`${t("tord.removeLine")} ${line.lineId}`}
                          disabled={draft.lines.length === 1}
                          onClick={() => removeLine(line.lineId)}
                        >
                          {t("tord.removeLine")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {preview && (
                    <tr className="tord-total">
                      <th scope="row" colSpan={1 + lineFields.length}>
                        {t("tord.total")}
                      </th>
                      {amountKeys.map((key) => (
                        <td key={key}>{money(preview[key])}</td>
                      ))}
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {errorText("lines")}
            <div className="ui-form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={draft.lines.length >= 100}
                onClick={addLine}
              >
                {t("tord.addLine")}
              </button>
            </div>
          </fieldset>
        </FastTab>
        <datalist id="tord-party-options">
          {partyOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
        <datalist id="tord-product-options">
          {productOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
        <datalist id="tord-tax-options">
          {taxOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
      </form>
      {saved && (
        <FastTab id="tord-saved" title={t("tord.savedTitle")} summary={saved.orderId}>
          <OrderView order={saved} company={company} language={language} money={money} t={t} />
        </FastTab>
      )}
      <OrderList
        company={company}
        language={language}
        money={money}
        t={t}
        params={params}
        onFilter={onFilter}
        onOpen={(orderId) => open(orderId, true)}
      />
      <OrderLookup
        company={company}
        language={language}
        money={money}
        t={t}
        request={opened}
        onLookup={(orderId) => open(orderId, false)}
        onBack={onBack}
      />
    </>
  );
}
