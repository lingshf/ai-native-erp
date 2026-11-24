import {
  businessPreviewSchema,
  businessResultSchema,
  journalDetailSchema,
  type BusinessResultDto,
} from "@erp/core/contracts";
import { MasterDataFailure, masterRequest } from "../master-data-client.ts";
import { freshDraft, type DraftOperation } from "./event-drafts.ts";
import { companyQuery } from "./list.tsx";
import type { CompanyEventsState, Withdrawal } from "./use-company-events.ts";
// Commands read the state of the render that created their handler, as the inline closures did.
type State = CompanyEventsState;
/** HTTP statuses below this are definite rejections; anything else may have been applied. */
export const KNOWN_REJECTION_STATUS_LIMIT = 500;
export function isKnownRejection(cause: unknown) {
  return (
    cause instanceof MasterDataFailure &&
    cause.kind === "http" &&
    cause.status !== undefined &&
    cause.status < KNOWN_REJECTION_STATUS_LIMIT
  );
}
export async function run(s: State, action: () => Promise<void>) {
  if (s.working.current) return;
  if (!s.review && !s.withdraw)
    s.returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  s.working.current = true;
  s.setBusy(true);
  s.setError(undefined);
  try {
    await action();
  } catch (cause) {
    if (s.alive.current) s.setError(cause);
  } finally {
    s.working.current = false;
    if (s.alive.current) s.setBusy(false);
  }
}
function complete(s: State, result: BusinessResultDto) {
  if (!s.alive.current) return;
  s.setDetail(result);
  s.setDraft(null);
  s.setEntry(null);
  s.setReview(null);
  s.setWithdraw(null);
  s.setUncertain(false);
  void s.client.invalidateQueries({ queryKey: ["business", s.company.code] });
  void s.client.invalidateQueries({ queryKey: ["journals", s.company.code] });
}
function rejected(s: State, cause: unknown) {
  const known = isKnownRejection(cause);
  if (s.alive.current) {
    s.setUncertain(!known);
    if (known) {
      s.setReview(null);
      s.setWithdraw(null);
    }
  }
}
export function fresh(s: State, operation: DraftOperation, originalId?: string) {
  s.setDraft(freshDraft(operation, s.company.currency, originalId));
  s.setDetail(null);
  s.setEntry(null);
  s.setError(undefined);
}
export const preview = (s: State) =>
  run(s, async () => {
    if (!s.draft) return;
    const draft = s.draft;
    const result = await masterRequest("/api/v1/events/preview", businessPreviewSchema, {
      method: "POST",
      body: { company: s.company.code, event: draft },
    });
    if (s.alive.current) s.setReview({ preview: result, event: draft, key: crypto.randomUUID() });
  });
export const confirm = (s: State) =>
  run(s, async () => {
    const review = s.review;
    if (!review) return;
    try {
      const result =
        "event" in review
          ? await masterRequest("/api/v1/events/confirm", businessResultSchema, {
              method: "POST",
              body: {
                company: s.company.code,
                event: review.event,
                fingerprint: review.preview.fingerprint,
                idempotencyKey: review.key,
                confirmation: "POST",
              },
            })
          : await masterRequest(
              `/api/v1/transfer-queue/${review.queueId}/confirm`,
              businessResultSchema,
              {
                method: "POST",
                body: {
                  company: s.company.code,
                  fingerprint: review.preview.fingerprint,
                  confirmation: "TRANSFER",
                },
              },
            );
      complete(s, result);
    } catch (cause) {
      rejected(s, cause);
      throw cause;
    }
  });
/** List "view" (events and queue): shows the event and clears the open journal entry. */
export const openEvent = (s: State, id: string) =>
  run(s, async () => {
    const result = await masterRequest(
      `/api/v1/events/${id}?${companyQuery(s.company.code)}`,
      businessResultSchema,
    );
    if (s.alive.current) {
      s.setDetail(result);
      s.setEntry(null);
    }
  });
/** Detail "original event" link: unlike `openEvent`, keeps the open journal entry. */
export function openOriginal(s: State, event: BusinessResultDto["event"]) {
  if (event.operation === "cash_service.cancel")
    void run(s, async () => {
      const result = await masterRequest(
        `/api/v1/events/${event.originalId}?${companyQuery(s.company.code)}`,
        businessResultSchema,
      );
      if (s.alive.current) s.setDetail(result);
    });
}
export const openJournal = (s: State, id: string) =>
  run(s, async () => {
    const result = await masterRequest(
      `/api/v1/journals/${id}?${companyQuery(s.company.code)}`,
      journalDetailSchema,
    );
    if (s.alive.current) s.setEntry(result);
  });
export const previewQueueItem = (s: State, id: string) =>
  run(s, async () => {
    const result = await masterRequest(
      `/api/v1/transfer-queue/${id}/preview`,
      businessPreviewSchema,
      { method: "POST", body: { company: s.company.code } },
    );
    if (s.alive.current) s.setReview({ preview: result, queueId: id });
  });
/** Opens the withdraw dialog directly, without `run`. */
export function startWithdraw(s: State, id: string) {
  s.returnFocus.current =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  s.setError(undefined);
  s.setWithdraw({ id, reason: "" });
}
export const confirmWithdraw = (s: State, withdraw: Withdrawal) =>
  run(s, async () => {
    try {
      complete(
        s,
        await masterRequest(
          `/api/v1/transfer-queue/${withdraw.id}/withdraw`,
          businessResultSchema,
          {
            method: "POST",
            body: {
              company: s.company.code,
              reason: withdraw.reason,
              confirmation: "WITHDRAW",
            },
          },
        ),
      );
    } catch (cause) {
      rejected(s, cause);
      throw cause;
    }
  });
