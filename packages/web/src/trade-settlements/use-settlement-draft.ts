import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CompanyDto,
  TradeSettlementPreviewDto,
  TradeSettlementReceiptDto,
} from "@erp/core/contracts";
import type { Guard } from "./settlement-model.ts";
import { initial, storageKey } from "./settlement-storage.ts";

// The draft's state, refs and effects, in the order SettlementEntry has always called them.
export function useSettlementDraft(company: CompanyDto, onGuard: (guard: Guard) => void) {
  const [loaded] = useState(() => initial(company));
  const [saved, setSaved] = useState(loaded.saved);
  const [storageFailed, setStorageFailed] = useState(loaded.failed);
  const [preview, setPreview] = useState<TradeSettlementPreviewDto | null>(null);
  const [receipt, setReceipt] = useState<TradeSettlementReceiptDto | null>(null);
  const [busy, setBusy] = useState(false);
  // The outcome is unknown only after a send failed without a server answer (or on reload),
  // never while the first send is still in flight.
  const [uncertain, setUncertain] = useState(loaded.saved.pending !== null);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const command = saved.command;
  const locked = busy || saved.pending !== null || storageFailed;
  const result = receipt ?? preview;
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (storageFailed) return;
    try {
      window.sessionStorage.setItem(storageKey(company.code), JSON.stringify(saved));
    } catch {
      setStorageFailed(true);
    }
  }, [company.code, saved, storageFailed]);
  useLayoutEffect(() => {
    onGuard({
      busy: busy || saved.pending !== null,
      unsaved: command.party !== "" || command.items.length > 0,
    });
  }, [busy, saved.pending, command.party, command.items.length, onGuard]);
  return {
    saved,
    setSaved,
    storageFailed,
    setStorageFailed,
    preview,
    setPreview,
    receipt,
    setReceipt,
    busy,
    setBusy,
    uncertain,
    setUncertain,
    running,
    error,
    setError,
    sequence,
    command,
    locked,
    result,
  };
}
export type SettlementDraft = ReturnType<typeof useSettlementDraft>;
