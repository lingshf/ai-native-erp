import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountsPageSchema,
  businessMastersPageSchema,
  postingRulesPageSchema,
  businessMasterSchema,
  postingRuleSchema,
  type CompanyDto,
  type BusinessMasterDto,
  type PostingRuleDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { DimensionFields } from "../Journals.tsx";
import { BusinessError } from "./business-error.tsx";
import { PageControls, PageTable, usePage } from "./list.tsx";
import type { T } from "./types.ts";
export function BusinessSettings({
  company,
  t,
  dimensionKeys,
  lock,
}: {
  company: CompanyDto;
  t: T;
  dimensionKeys: string[];
  lock: (value: boolean) => void;
}) {
  const [kind, setKind] = useState<"services" | "parties" | "rules">("services"),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    lock(editing);
    return () => lock(false);
  }, [editing, lock]);
  return (
    <section>
      <h3>{t("business.settings")}</h3>
      <div className="journal-actions">
        {(["services", "parties", "rules"] as const).map((item) => (
          <button
            className="jv-btn"
            key={item}
            type="button"
            aria-pressed={kind === item}
            disabled={editing}
            onClick={() => setKind(item)}
          >
            {t(`business.${item}`)}
          </button>
        ))}
      </div>
      {kind === "rules" ? (
        <RuleSettings company={company} t={t} dimensionKeys={dimensionKeys} lock={setEditing} />
      ) : (
        <MasterSettings
          key={kind}
          kind={kind}
          company={company}
          t={t}
          dimensionKeys={dimensionKeys}
          lock={setEditing}
        />
      )}
    </section>
  );
}
function MasterSettings({
  kind,
  company,
  t,
  dimensionKeys,
  lock,
}: {
  kind: "services" | "parties";
  company: CompanyDto;
  t: T;
  dimensionKeys: string[];
  lock: (value: boolean) => void;
}) {
  const page = usePage(kind, company.code, businessMastersPageSchema),
    client = useQueryClient(),
    form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<BusinessMasterDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  const working = useRef(false),
    alive = useRef(true),
    editing = value !== null;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    lock(editing || busy);
    return () => lock(false);
  }, [editing, busy, lock]);
  // Entering edit, or a failed save (busy ends while still editing); layout phase so focus is not a task late.
  useLayoutEffect(() => {
    if (editing && !busy)
      form.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
  }, [editing, busy]);
  return (
    <>
      <button
        className="jv-btn"
        type="button"
        disabled={editing || busy}
        onClick={() => {
          setValue({ code: "", name: "", group: "", active: true, revision: 0, dimensions: {} });
          setError(undefined);
          setSaved(false);
        }}
      >
        {t("business.new")}
      </button>
      <PageTable
        page={page}
        t={t}
        title={t(`business.${kind}`)}
        header={[t("business.code"), t("business.name"), t("business.group"), ""]}
        render={(item) => (
          <>
            <td>{item.code}</td>
            <td>{item.name}</td>
            <td>
              {item.group} · {item.active ? t("business.active") : "—"}
            </td>
            <td>
              <button
                className="jv-btn"
                type="button"
                disabled={editing || busy}
                onClick={() => {
                  setValue(item);
                  setError(undefined);
                  setSaved(false);
                }}
              >
                {t("business.edit")}
              </button>
            </td>
          </>
        )}
      />
      {error !== undefined && <BusinessError error={error} t={t} />}
      {saved && <p role="status">{t("business.saved")}</p>}
      {value && (
        <form
          ref={form}
          onSubmit={(submit) => {
            submit.preventDefault();
            if (working.current) return;
            working.current = true;
            setBusy(true);
            setError(undefined);
            void masterRequest(`/api/v1/${kind}`, businessMasterSchema, {
              method: "POST",
              body: { company: company.code, value },
            })
              .then(
                () => {
                  if (alive.current) {
                    setValue(null);
                    setSaved(true);
                    void client.invalidateQueries({ queryKey: ["business", company.code, kind] });
                  }
                },
                (cause) => {
                  if (alive.current) setError(cause);
                },
              )
              .finally(() => {
                working.current = false;
                if (alive.current) setBusy(false);
              });
          }}
        >
          <fieldset disabled={busy}>
            <legend className="jv-legend">{t(`business.${kind}`)}</legend>
            <label>
              {t("business.code")}
              <input
                required
                disabled={value.revision > 0}
                value={value.code}
                onChange={(e) => setValue({ ...value, code: e.target.value })}
              />
            </label>
            <label>
              {t("business.name")}
              <input
                required
                maxLength={80}
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </label>
            <label>
              {t("business.group")}
              <input
                required
                value={value.group}
                onChange={(e) => setValue({ ...value, group: e.target.value })}
              />
            </label>
            <label>
              {t("business.active")}
              <input
                type="checkbox"
                className="jv-check"
                checked={value.active}
                onChange={(e) => setValue({ ...value, active: e.target.checked })}
              />
            </label>
            <DimensionFields
              title={t("journal.dimensions")}
              keys={[...new Set([...dimensionKeys, ...Object.keys(value.dimensions)])]}
              value={value.dimensions}
              change={(dimensions) => setValue({ ...value, dimensions })}
            />
            <button type="submit" className="jv-btn">
              {t("business.save")}
            </button>
            <button
              className="jv-btn"
              type="button"
              onClick={() => {
                setValue(null);
                setError(undefined);
              }}
            >
              {t("journal.cancel")}
            </button>
          </fieldset>
        </form>
      )}
    </>
  );
}
function RuleSettings({
  company,
  t,
  dimensionKeys,
  lock,
}: {
  company: CompanyDto;
  t: T;
  dimensionKeys: string[];
  lock: (value: boolean) => void;
}) {
  const page = usePage("posting-rules", company.code, postingRulesPageSchema),
    accounts = usePage("accounts", company.code, accountsPageSchema),
    client = useQueryClient();
  const [value, setValue] = useState<PostingRuleDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  const working = useRef(false),
    alive = useRef(true),
    form = useRef<HTMLFormElement>(null),
    editing = value !== null;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    lock(editing || busy);
    return () => lock(false);
  }, [editing, busy, lock]);
  // Same as MasterSettings: refocus in the layout phase on entering edit or after a failed save.
  useLayoutEffect(() => {
    if (editing && !busy)
      form.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
  }, [editing, busy]);
  const newRule = (): PostingRuleDto => ({
    code: "",
    revision: 0,
    active: true,
    direction: "receive",
    meaning: "cash",
    objectScope: "exact",
    objectCode: "",
    partyScope: "all",
    partyCode: "*",
    account: "",
    dimensions: {},
    from: `${company.year}-01-01`,
    to: `${company.year}-12-31`,
  });
  return (
    <>
      <button
        className="jv-btn"
        type="button"
        disabled={editing || busy}
        onClick={() => {
          setValue(newRule());
          setError(undefined);
          setSaved(false);
        }}
      >
        {t("business.new")}
      </button>
      <PageTable
        page={page}
        t={t}
        title={t("business.rules")}
        header={[
          t("business.code"),
          t("business.direction"),
          t("business.meaning"),
          t("journal.account"),
          "",
        ]}
        render={(item) => (
          <>
            <td>
              {item.code} · {item.objectScope}/{item.objectCode} · {item.partyScope}/
              {item.partyCode}
            </td>
            <td>{t(`business.${item.direction}`)}</td>
            <td>{t(`business.${item.meaning}`)}</td>
            <td>{item.account}</td>
            <td>
              <button
                className="jv-btn"
                type="button"
                disabled={editing || busy}
                onClick={() => {
                  setValue(item);
                  setError(undefined);
                  setSaved(false);
                }}
              >
                {t("business.edit")}
              </button>
            </td>
          </>
        )}
      />
      {error !== undefined && <BusinessError error={error} t={t} />}
      {saved && <p role="status">{t("business.saved")}</p>}
      {value && (
        <form
          ref={form}
          onSubmit={(submit) => {
            submit.preventDefault();
            if (working.current) return;
            working.current = true;
            setBusy(true);
            setError(undefined);
            void masterRequest("/api/v1/posting-rules", postingRuleSchema, {
              method: "POST",
              body: { company: company.code, value },
            })
              .then(
                () => {
                  if (alive.current) {
                    setValue(null);
                    setSaved(true);
                    void client.invalidateQueries({
                      queryKey: ["business", company.code, "posting-rules"],
                    });
                  }
                },
                (cause) => {
                  if (alive.current) setError(cause);
                },
              )
              .finally(() => {
                working.current = false;
                if (alive.current) setBusy(false);
              });
          }}
        >
          <fieldset disabled={busy}>
            <legend className="jv-legend">{t("business.rules")}</legend>
            <label>
              {t("business.code")}
              <input
                required
                disabled={value.revision > 0}
                value={value.code}
                onChange={(e) => setValue({ ...value, code: e.target.value })}
              />
            </label>
            <label>
              {t("business.active")}
              <input
                type="checkbox"
                className="jv-check"
                checked={value.active}
                onChange={(e) => setValue({ ...value, active: e.target.checked })}
              />
            </label>
            <label>
              {t("business.direction")}
              <select
                className="jv-select"
                value={value.direction}
                onChange={(e) => {
                  if (e.target.value === "receive" || e.target.value === "pay")
                    setValue({ ...value, direction: e.target.value });
                }}
              >
                {(["receive", "pay"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(`business.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("business.meaning")}
              <select
                className="jv-select"
                value={value.meaning}
                onChange={(e) => {
                  if (e.target.value === "cash" || e.target.value === "offset")
                    setValue({ ...value, meaning: e.target.value });
                }}
              >
                <option value="cash">{t("business.cash")}</option>
                <option value="offset">{t("business.offset")}</option>
              </select>
            </label>
            <label>
              {t("business.objectScope")}
              <select
                className="jv-select"
                value={value.objectScope}
                onChange={(e) => {
                  const scope = e.target.value;
                  if (scope === "exact" || scope === "group" || scope === "all")
                    setValue({
                      ...value,
                      objectScope: scope,
                      objectCode: scope === "all" ? "*" : "",
                    });
                }}
              >
                {(["exact", "group", "all"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(item === "group" ? "business.groupScope" : `business.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("business.objectCode")}
              <input
                required
                disabled={value.objectScope === "all"}
                value={value.objectCode}
                onChange={(e) => setValue({ ...value, objectCode: e.target.value })}
              />
            </label>
            <label>
              {t("business.partyScope")}
              <select
                className="jv-select"
                value={value.partyScope}
                onChange={(e) => {
                  const scope = e.target.value;
                  if (scope === "exact" || scope === "group" || scope === "all")
                    setValue({
                      ...value,
                      partyScope: scope,
                      partyCode: scope === "all" ? "*" : "",
                    });
                }}
              >
                {(["exact", "group", "all"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(item === "group" ? "business.groupScope" : `business.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("business.partyCode")}
              <input
                required
                disabled={value.partyScope === "all"}
                value={value.partyCode}
                onChange={(e) => setValue({ ...value, partyCode: e.target.value })}
              />
            </label>
            <label>
              {t("journal.account")}
              <input
                required
                list="business-rule-accounts"
                pattern="[1-9][0-9]{3}"
                value={value.account}
                onChange={(e) => setValue({ ...value, account: e.target.value })}
              />
            </label>
            <datalist id="business-rule-accounts">
              {accounts.data?.pages
                .flatMap((p) => p.items)
                .map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
            </datalist>
            <PageControls page={accounts} t={t} />
            <label>
              {t("business.from")}
              <input
                required
                type="date"
                value={value.from}
                onChange={(e) => setValue({ ...value, from: e.target.value })}
              />
            </label>
            <label>
              {t("business.to")}
              <input
                required
                type="date"
                value={value.to}
                onChange={(e) => setValue({ ...value, to: e.target.value })}
              />
            </label>
            <DimensionFields
              title={t("journal.dimensions")}
              keys={[...new Set([...dimensionKeys, ...Object.keys(value.dimensions)])]}
              value={value.dimensions}
              change={(dimensions) => setValue({ ...value, dimensions })}
            />
            <button type="submit" className="jv-btn">
              {t("business.save")}
            </button>
            <button
              className="jv-btn"
              type="button"
              onClick={() => {
                setValue(null);
                setError(undefined);
              }}
            >
              {t("journal.cancel")}
            </button>
          </fieldset>
        </form>
      )}
    </>
  );
}
