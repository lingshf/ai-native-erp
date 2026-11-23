import type { KeyboardEvent } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  businessResultSchema,
  journalDeletedSchema,
  journalDraftSchema,
  journalPreviewSchema,
  journalReceiptSchema,
  type BusinessResultDto,
  type CompanyDto,
  type JournalDetailDto,
  type JournalDraftDto,
  type JournalReceiptDto,
} from "@erp/core/contracts";
import { MasterDataFailure, masterRequest } from "../master-data-client.ts";
import {
  companyParam,
  emptyLine,
  MAX_JOURNAL_LINES,
  minorToDecimal,
  newDraft,
} from "./journal-draft.ts";
import type { useJournalDetail } from "./use-journal-detail.ts";
import type { ConfirmCommand, EditorRefs, JournalState } from "./use-journal-state.ts";

/** Everything one render of CompanyJournals hands to its commands and components. */
export type JournalContext = JournalState &
  EditorRefs &
  ReturnType<typeof useJournalDetail> & {
    company: CompanyDto;
    client: QueryClient;
    lock: (value: boolean) => void;
  };
type JournalLine = JournalDraftDto["lines"][number];
export type CorrectionOperation = "reverse" | "replace" | "reclassify";

export function edit(journal: JournalContext, value: JournalDraftDto | null) {
  journal.cancelDetail();
  journal.lineKeys.current = value?.lines.map(() => crypto.randomUUID()) ?? [];
  journal.setDraft(value);
  journal.setDirty(value !== null && value.revision === 0);
  journal.lock(value !== null);
  journal.setPlan(null);
  journal.setUncertain(false);
  journal.setError(undefined);
  journal.setNotice(null);
}
export async function run(journal: JournalContext, action: () => Promise<void>) {
  const { working, alive } = journal;
  if (working.current) return;
  if (!journal.plan && !journal.deleting)
    journal.returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  working.current = true;
  journal.setBusy(true);
  journal.setError(undefined);
  journal.setNotice(null);
  try {
    await action();
  } catch (error) {
    if (alive.current) journal.setError(error);
  } finally {
    working.current = false;
    if (alive.current) journal.setBusy(false);
  }
}
async function save(journal: JournalContext): Promise<JournalDraftDto> {
  const { draft, company } = journal;
  if (!draft) throw new Error("Missing journal editor");
  const saved = await masterRequest(
    draft.revision
      ? `/api/v1/journals/drafts/${draft.id}`
      : `/api/v1/journals/${draft.operation === "journal" ? "drafts" : draft.operation}`,
    journalDraftSchema,
    { method: draft.revision ? "PUT" : "POST", body: { company: company.code, draft } },
  );
  if (journal.alive.current) {
    journal.setDraft(saved);
    journal.setDirty(false);
    void journal.client.invalidateQueries({ queryKey: ["journals", company.code] });
  }
  return saved;
}
export const saveDraft = (journal: JournalContext) =>
  run(journal, async () => {
    await save(journal);
    if (journal.alive.current) journal.setNotice("saved");
  });
export const preview = (journal: JournalContext) =>
  run(journal, async () => {
    const { draft, company } = journal;
    if (!draft) return;
    const result = await masterRequest("/api/v1/journals/preview", journalPreviewSchema, {
      method: "POST",
      body: { company: company.code, draft },
    });
    if (journal.alive.current)
      journal.setPlan({ ...result, key: crypto.randomUUID(), command: "POST" });
  });
function applyConfirmed(journal: JournalContext, result: BusinessResultDto | JournalReceiptDto) {
  const { client, company } = journal;
  edit(journal, null);
  if ("event" in result) {
    journal.setQueued(result);
    journal.setReceipt(null);
    void client.invalidateQueries({ queryKey: ["business", company.code] });
  } else {
    journal.setReceipt(result);
    journal.setQueued(null);
    journal.setStatus("posted");
  }
  journal.setDetail(null);
  void client.invalidateQueries({ queryKey: ["journals", company.code] });
}
function applyConfirmFailure(journal: JournalContext, error: unknown) {
  const rejected =
    error instanceof MasterDataFailure &&
    error.kind === "http" &&
    error.status !== undefined &&
    error.status < 500;
  if (rejected) {
    journal.setPlan(null);
    journal.setUncertain(false);
  } else journal.setUncertain(true);
}
export const confirm = (journal: JournalContext, command: ConfirmCommand) =>
  run(journal, async () => {
    const { plan, company } = journal;
    if (!plan || journal.dirty || (journal.uncertain && command !== plan.command)) return;
    const request = {
      company: company.code,
      draftId: plan.plan.draftId,
      revision: plan.plan.draftRevision,
      fingerprint: plan.fingerprint,
      idempotencyKey: plan.key,
      confirmation: command,
    };
    journal.setPlan({ ...plan, command });
    try {
      const result =
        command === "QUEUE"
          ? await masterRequest("/api/v1/transfer-queue", businessResultSchema, {
              method: "POST",
              body: request,
            })
          : await masterRequest("/api/v1/journals/confirm", journalReceiptSchema, {
              method: "POST",
              body: request,
            });
      if (journal.alive.current) applyConfirmed(journal, result);
    } catch (error) {
      if (journal.alive.current) applyConfirmFailure(journal, error);
      throw error;
    }
  });
export function change(journal: JournalContext, patch: Partial<JournalDraftDto>) {
  const { draft } = journal;
  if (draft) {
    journal.setDraft({ ...draft, ...patch });
    journal.setDirty(true);
    journal.setNotice(null);
    journal.setError(undefined);
  }
}
export function addLine(journal: JournalContext) {
  const { draft } = journal;
  if (draft && draft.lines.length < MAX_JOURNAL_LINES) {
    journal.lineKeys.current.push(crypto.randomUUID());
    journal.focusLine.current = draft.lines.length;
    change(journal, { lines: [...draft.lines, emptyLine()] });
  }
}
export function patchLine(
  journal: JournalContext,
  lines: JournalDraftDto["lines"],
  index: number,
  value: Partial<JournalLine>,
) {
  change(journal, {
    lines: lines.map((item, i) => (i === index ? { ...item, ...value } : item)),
  });
}
export function removeLine(
  journal: JournalContext,
  lines: JournalDraftDto["lines"],
  index: number,
) {
  journal.lineKeys.current.splice(index, 1);
  change(journal, { lines: lines.filter((_, i) => i !== index) });
}
/** Enter (or Tab on the last field of the last line) moves to the next line, adding one at the end. */
export function lineKeyDown(
  journal: JournalContext,
  event: KeyboardEvent<HTMLTableRowElement>,
  index: number,
) {
  if (
    !(event.target instanceof HTMLInputElement) ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;
  const last = index === (journal.draft?.lines.length ?? 0) - 1;
  if (
    event.key === "Enter" ||
    (event.key === "Tab" &&
      last &&
      event.target === Array.from(event.currentTarget.querySelectorAll("input")).at(-1))
  ) {
    event.preventDefault();
    if (last) addLine(journal);
    else
      journal.form.current
        ?.querySelector<HTMLInputElement>(`[data-account="${index + 1}"]`)
        ?.focus();
  }
}
function correctionLines(original: JournalDetailDto["entry"], scale: number): JournalLine[] {
  return original.lines
    .filter((line) => line.role === "business")
    .map((line) => ({
      account: line.account,
      debit: minorToDecimal(line.debit, scale),
      credit: minorToDecimal(line.credit, scale),
      dimensions: line.dimensions,
      suspense: line.suspense,
    }));
}
export function startCorrection(journal: JournalContext, operation: CorrectionOperation) {
  if (!journal.detail) return;
  const original = journal.detail.entry;
  if (original.kind === "closing") return;
  edit(journal, {
    ...newDraft(),
    operation,
    originalId: original.id,
    kind: original.kind,
    lines: operation === "reverse" ? [] : correctionLines(original, journal.company.scale),
  });
}
export function startNewDraft(journal: JournalContext) {
  edit(journal, newDraft());
  journal.setReceipt(null);
  journal.setQueued(null);
  journal.setDetail(null);
}
export function adoptDraft(journal: JournalContext, value: JournalDraftDto) {
  edit(journal, value);
  journal.setDetail(null);
  journal.setReceipt(null);
  journal.setQueued(null);
}
export const openListRow = (
  journal: JournalContext,
  row: { id: string; revision: number | null },
) =>
  run(journal, async () => {
    journal.cancelDetail();
    if (row.revision !== null) {
      const value = await masterRequest(
        `/api/v1/journals/drafts/${row.id}?${companyParam(journal.company.code)}`,
        journalDraftSchema,
      );
      if (journal.alive.current) {
        edit(journal, value);
        journal.setDetail(null);
      }
    } else {
      await journal.loadDetail(row.id, true);
    }
  });
export const reloadDraft = (journal: JournalContext, draft: JournalDraftDto) =>
  run(journal, async () => {
    const saved = await masterRequest(
      `/api/v1/journals/drafts/${draft.id}?${companyParam(journal.company.code)}`,
      journalDraftSchema,
    );
    if (journal.alive.current) edit(journal, saved);
  });
export const deleteDraft = (journal: JournalContext, draft: JournalDraftDto) =>
  run(journal, async () => {
    const { company } = journal;
    await masterRequest(`/api/v1/journals/drafts/${draft.id}`, journalDeletedSchema, {
      method: "DELETE",
      body: { company: company.code, revision: draft.revision },
    });
    if (journal.alive.current) {
      journal.setDeleting(false);
      edit(journal, null);
      void journal.client.invalidateQueries({ queryKey: ["journals", company.code] });
    }
  });
export function requestDelete(journal: JournalContext, trigger: HTMLElement) {
  journal.returnFocus.current = trigger;
  journal.setDeleting(true);
}
