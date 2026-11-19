import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { periodCommandSchema, periodSchema, type PeriodDto } from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { label, type Preferences } from "./ui/index.ts";
import { useInvoiceLeaveGuard } from "./TradeInvoices.tsx";

type Pending = ReturnType<typeof periodCommandSchema.parse>;
export function TradePeriodAdmission({
  company,
  period,
  preferences,
  lock,
  disabled,
}: {
  company: string;
  period: PeriodDto;
  preferences: Preferences;
  lock: (value: boolean) => void;
  disabled: boolean;
}) {
  const key = `erp.tradePeriod.v1.${company}.${period.month}`;
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const client = useQueryClient();
  const [loaded] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return { pending: null, failed: false };
      const pending = periodCommandSchema.parse(JSON.parse(raw));
      if (pending.company !== company || pending.month !== period.month)
        throw new Error("Invalid saved period");
      return { pending, failed: false };
    } catch {
      return { pending: null, failed: true };
    }
  });
  const [modules, setModules] = useState(loaded.pending?.modules ?? period.modules);
  const [reason, setReason] = useState(loaded.pending?.reason ?? "");
  const [pending, setPending] = useState<Pending | null>(loaded.pending);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<"master.error" | "trpt.storage" | "trpt.unknown" | null>(
    loaded.failed ? "trpt.storage" : null,
  );
  const dirty = reason !== "" || [...modules].sort().join() !== [...period.modules].sort().join();
  useInvoiceLeaveGuard({
    busy: busy || pending !== null || dirty || loaded.failed,
    unsaved: dirty,
  });
  useEffect(() => {
    lock(busy || dirty || pending !== null || loaded.failed);
    return () => lock(false);
  }, [busy, dirty, pending, lock, loaded.failed]);
  function clearPending(): boolean {
    try {
      sessionStorage.removeItem(key);
      if (sessionStorage.getItem(key) !== null) throw new Error("Confirmation cleanup mismatch");
      return true;
    } catch {
      setError("trpt.storage");
      return false;
    }
  }
  async function save() {
    if (running.current || (!pending && (!reason.trim() || !dirty))) return;
    let body: Pending;
    try {
      body =
        pending ??
        periodCommandSchema.parse({
          company,
          month: period.month,
          revision: period.revision,
          status: period.status,
          reason,
          confirmed: true,
          modules,
        });
      const serialized = JSON.stringify(body);
      sessionStorage.setItem(key, serialized);
      if (sessionStorage.getItem(key) !== serialized)
        throw new Error("Confirmation readback mismatch");
    } catch {
      setError("trpt.storage");
      return;
    }
    running.current = true;
    setPending(body);
    setBusy(true);
    setError(null);
    try {
      const result = await masterRequest("/api/v1/periods", periodSchema, { method: "PUT", body });
      if (
        result.month !== body.month ||
        result.revision !== body.revision + 1 ||
        [...result.modules].sort().join() !== [...body.modules].sort().join()
      )
        throw new MasterDataFailure("invalid");
      if (!clearPending()) return;
      setPending(null);
      setReason("");
      setModules(result.modules);
      await client.invalidateQueries({ queryKey: ["close-periods", company] });
    } catch (failure) {
      if (
        failure instanceof MasterDataFailure &&
        failure.kind === "http" &&
        (failure.status ?? 500) < 500
      ) {
        if (!clearPending()) return;
        setPending(null);
        setError("master.error");
        void client.invalidateQueries({ queryKey: ["close-periods", company] });
      } else setError("trpt.unknown");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={disabled || busy || loaded.failed || period.status === "closed"}>
      <legend>{t("trpt.admission")}</legend>
      <p>{t("trpt.admissionNote")}</p>
      {(["trade", "tax"] as const).map((module) => (
        <label key={module}>
          <input
            type="checkbox"
            checked={modules.includes(module)}
            disabled={pending !== null}
            onChange={(e) =>
              setModules(
                e.target.checked
                  ? [...modules, module]
                  : modules.filter((value) => value !== module),
              )
            }
          />
          {t(module === "trade" ? "trpt.trade" : "trpt.taxModule")}
        </label>
      ))}
      <label htmlFor="trade-period-reason">{t("trpt.reason")}</label>
      <input
        id="trade-period-reason"
        maxLength={160}
        value={reason}
        disabled={pending !== null}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p role="alert">{t(error)}</p>}
      <button
        type="button"
        disabled={!pending && (!dirty || !reason.trim())}
        onClick={() => void save()}
      >
        {t(pending ? "master.retry" : "trpt.save")}
      </button>
    </fieldset>
  );
}
