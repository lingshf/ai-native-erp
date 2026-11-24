import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  dimensionPageSchema,
  businessEventsPageSchema,
  businessResultSchema,
  transferQueuePageSchema,
  type CompanyDto,
  type BusinessEventDto,
  type BusinessPreviewDto,
  type BusinessResultDto,
  type JournalDetailDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { companyQuery, usePage } from "./list.tsx";
import type { QueueStatus } from "./queue-view.tsx";
export type Review =
  | { preview: BusinessPreviewDto; event: BusinessEventDto; key: string }
  | { preview: BusinessPreviewDto; queueId: string };
export type Withdrawal = { id: string; reason: string };
export type CompanyEventsState = ReturnType<typeof useCompanyEvents>;
type Options = {
  company: CompanyDto;
  lock: (value: boolean) => void;
  initialId: string | null;
  initialQueue: boolean;
};
/** All page state, queries and effects of `CompanyEvents`, in the page's original hook order. */
export function useCompanyEvents({ company, lock, initialId, initialQueue }: Options) {
  const client = useQueryClient();
  const [view, setView] = useState<"events" | "settings" | "queue">(
    initialQueue ? "queue" : "events",
  );
  const [draft, setDraft] = useState<BusinessEventDto | null>(null),
    [review, setReview] = useState<Review | null>(null);
  const [detail, setDetail] = useState<BusinessResultDto | null>(null),
    [entry, setEntry] = useState<JournalDetailDto | null>(null);
  const [withdraw, setWithdraw] = useState<{ id: string; reason: string } | null>(null),
    [status, setStatus] = useState<QueueStatus>("pending");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [configEditing, setConfigEditing] = useState(false),
    [error, setError] = useState<unknown>();
  const working = useRef(false),
    alive = useRef(true),
    returnFocus = useRef<HTMLElement | null>(null);
  const editing = Boolean(draft || review || withdraw || configEditing);
  const listing = usePage("events", company.code, businessEventsPageSchema, "", view === "events");
  const queueQuery = `&status=${status}`;
  const queue = usePage(
    "transfer-queue",
    company.code,
    transferQueuePageSchema,
    queueQuery,
    view === "queue",
  );
  const dimensions = usePage("dimensions", company.code, dimensionPageSchema, "&kind=dimension");
  const dimensionKeys =
    dimensions.data?.pages.flatMap((p) => p.items.map((item) => item.code)) ?? [];
  useCompanyEventsEffects({ alive, returnFocus, editing, busy, lock, review, withdraw });
  useEventDeepLink({ initialId, company, setDetail, setError });
  return {
    company,
    client,
    view,
    setView,
    draft,
    setDraft,
    review,
    setReview,
    detail,
    setDetail,
    entry,
    setEntry,
    withdraw,
    setWithdraw,
    status,
    setStatus,
    busy,
    setBusy,
    uncertain,
    setUncertain,
    setConfigEditing,
    error,
    setError,
    working,
    alive,
    returnFocus,
    editing,
    listing,
    queueQuery,
    queue,
    dimensions,
    dimensionKeys,
  };
}
type EffectInputs = {
  alive: MutableRefObject<boolean>;
  returnFocus: MutableRefObject<HTMLElement | null>;
  editing: boolean;
  busy: boolean;
  lock: (value: boolean) => void;
  review: Review | null;
  withdraw: Withdrawal | null;
};
function useCompanyEventsEffects({
  alive,
  returnFocus,
  editing,
  busy,
  lock,
  review,
  withdraw,
}: EffectInputs) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the dependency list stays as in CompanyEvents before REFAC-14.
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
  // Layout phase: a passive effect after an async commit returns focus one task late.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the dependency list stays as in CompanyEvents before REFAC-14.
  useLayoutEffect(() => {
    if (!review && !withdraw && !busy) {
      const previous = returnFocus.current;
      if (previous?.isConnected) previous.focus();
    }
  }, [review, withdraw, busy]);
}
type DeepLinkInputs = {
  initialId: string | null;
  company: CompanyDto;
  setDetail: (detail: BusinessResultDto) => void;
  setError: (cause: unknown) => void;
};
function useEventDeepLink({ initialId, company, setDetail, setError }: DeepLinkInputs) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: setters are stable useState setters; the dependency list stays as in CompanyEvents before REFAC-14.
  useEffect(() => {
    if (!initialId) return;
    const controller = new AbortController();
    void masterRequest(
      `/api/v1/events/${encodeURIComponent(initialId)}?${companyQuery(company.code)}`,
      businessResultSchema,
      { signal: controller.signal },
    ).then(
      (result) => {
        if (!controller.signal.aborted) setDetail(result);
      },
      (cause) => {
        if (!controller.signal.aborted) setError(cause);
      },
    );
    return () => controller.abort();
  }, [initialId, company.code]);
}
