import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CompanyDto,
  TradeInvoicePreviewDto,
  TradeInvoiceReceiptDto,
} from "@erp/core/contracts";
import { blankDraft, idleGuard, type Failure, type Guard, type Pending } from "./invoice-model.ts";
import { loadSaved, storeSaved } from "./invoice-session.ts";

export type IntakeState = {
  status: "loaded" | "notFound" | "fullyInvoiced" | "failed" | "locked";
  orderId: string;
};
export type PreviewState = { value: TradeInvoicePreviewDto; command: string };

// Every state hook of the entry form, in the order InvoiceEntry has always called them.
export function useInvoiceEntryState(company: CompanyDto, onGuard: (guard: Guard) => void) {
  const client = useQueryClient();
  const [saved] = useState(() => loadSaved(company.code));
  const [draft, setDraft] = useState(() => saved?.draft ?? blankDraft());
  const [documentId, setDocumentId] = useState(() => saved?.documentId ?? crypto.randomUUID());
  const [dirty, setDirty] = useState(saved?.dirty ?? false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pending, setPending] = useState<Pending | null>(saved?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(
    saved?.pending ? { key: "tinv.uncertain", path: null } : null,
  );
  const [retry, setRetry] = useState(saved?.pending != null);
  // Layout effect so storage matches the committed screen: a render that shows the receipt has
  // already dropped the posted envelope. Best-effort draft autosave; the post envelope itself is
  // persisted synchronously in confirm().
  useLayoutEffect(() => {
    storeSaved(company.code, { draft, documentId, dirty, pending });
  }, [company.code, draft, documentId, dirty, pending]);
  useLayoutEffect(() => {
    onGuard({ busy, unsaved: dirty || pending !== null });
  }, [onGuard, busy, dirty, pending]);
  useLayoutEffect(() => () => onGuard(idleGuard), [onGuard]);
  const [receipt, setReceipt] = useState<TradeInvoiceReceiptDto | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const [fromOrder, setFromOrder] = useState<IntakeState | null>(null);
  return {
    client,
    draft,
    setDraft,
    documentId,
    setDocumentId,
    dirty,
    setDirty,
    preview,
    setPreview,
    pending,
    setPending,
    busy,
    setBusy,
    error,
    setError,
    retry,
    setRetry,
    receipt,
    setReceipt,
    firstField,
    fromOrder,
    setFromOrder,
  };
}
export type InvoiceEntryState = ReturnType<typeof useInvoiceEntryState>;

export function useOrderIntake(
  fromOrder: IntakeState | null,
  intake: string | null,
  onIntake: (done: null) => void,
  fillFromOrder: (orderId: string) => Promise<void>,
) {
  // Each fill sets a new "loaded" state object, so focus moves once per fill.
  useEffect(() => {
    if (fromOrder?.status === "loaded") document.getElementById("tinv-externalInvoice")?.focus();
  }, [fromOrder]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one load per address request; fillFromOrder reads that render's draft state.
  useEffect(() => {
    if (intake === null) return;
    onIntake(null);
    void fillFromOrder(intake);
  }, [intake, onIntake]);
}

export function useAddLineShortcut(locked: boolean, addLine: () => void) {
  // Layout effect: a passive effect leaves the previous render's listener (stale draft and locked
  // state) attached after commit, silently dropping a shortcut pressed in that window.
  useLayoutEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "n" && !locked) {
        event.preventDefault();
        addLine();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
}
