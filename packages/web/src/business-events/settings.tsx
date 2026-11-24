import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  businessMastersPageSchema,
  businessMasterSchema,
  type CompanyDto,
  type BusinessMasterDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { DimensionFields } from "../journals/dialogs.tsx";
import { BusinessError } from "./business-error.tsx";
import { PageTable, usePage } from "./list.tsx";
import { RuleSettings } from "./rule-settings.tsx";
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
