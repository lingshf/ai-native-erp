import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  openItemPageSchema,
  type CompanyDto,
  type TradeActionPreviewDto,
  type TradeActionReceiptDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { key, restore } from "./action-draft.ts";

export type Guard = { busy: boolean; unsaved: boolean };
export type ActionDraftState = ReturnType<typeof useActionDraft>;
export type ActionItemsState = ReturnType<typeof useActionItems>;
export type OpenItem = ActionItemsState["rows"][number];

// Draft, request and storage state of the entry form, plus the effects that persist the draft
// and report the leave guard; the order of these hooks is the order ActionEntry always used.
export function useActionDraft(company: CompanyDto, onGuard: (guard: Guard) => void) {
  const [loaded] = useState(() => restore(company.code));
  const [saved, setSaved] = useState(loaded.saved);
  const [storageFailed, setStorageFailed] = useState(loaded.failed);
  const [preview, setPreview] = useState<TradeActionPreviewDto | null>(null);
  const [receipt, setReceipt] = useState<TradeActionReceiptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The outcome is unknown only after a send failed without a server answer (or on reload),
  // never while the first send is still in flight.
  const [uncertain, setUncertain] = useState(loaded.saved.pending !== null);
  const sequence = useRef(0),
    running = useRef(false);
  const draft = saved.draft;
  const locked = busy || saved.pending !== null || storageFailed;
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (storageFailed) return;
    try {
      sessionStorage.setItem(key(company.code), JSON.stringify(saved));
    } catch {
      setStorageFailed(true);
    }
  }, [company.code, saved, storageFailed]);
  useLayoutEffect(() => {
    onGuard({
      busy: busy || saved.pending !== null,
      unsaved: !!(
        draft.party ||
        draft.sourceId ||
        draft.settlementId ||
        draft.gross ||
        draft.reason ||
        draft.items.length ||
        draft.lines.some((line) => line.sourceLineId || line.quantity)
      ),
    });
  }, [busy, saved.pending, draft, onGuard]);
  return {
    saved,
    setSaved,
    storageFailed,
    setStorageFailed,
    preview,
    setPreview,
    receipt,
    setReceipt,
    error,
    setError,
    busy,
    setBusy,
    uncertain,
    setUncertain,
    sequence,
    running,
    draft,
    locked,
  };
}

// Open items available to the action, narrowed by the applied party filter.
export function useActionItems(company: CompanyDto) {
  const client = useQueryClient();
  const [partyFilter, setPartyFilter] = useState("");
  const [partyInput, setPartyInput] = useState("");
  const page = useInfiniteQuery({
    queryKey: ["tradeActionItems", company.code, partyFilter],
    initialPageParam: "",
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/open-items?company=${encodeURIComponent(company.code)}${partyFilter ? `&party=${encodeURIComponent(partyFilter)}` : ""}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        openItemPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    client,
    partyFilter,
    setPartyFilter,
    partyInput,
    setPartyInput,
    page,
    rows,
  };
}

export function usePreviewLines(preview: TradeActionPreviewDto | null) {
  return useMemo(
    () =>
      preview?.journal.journals.flatMap((journal) =>
        journal.lines.map((line) => ({ id: crypto.randomUUID(), line })),
      ) ?? [],
    [preview],
  );
}
