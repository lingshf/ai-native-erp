import { useRef, useState } from "react";
import type {
  BusinessResultDto,
  JournalDetailDto,
  JournalDraftDto,
  JournalPreviewDto,
  JournalReceiptDto,
} from "@erp/core/contracts";

export type JournalStatus = "draft" | "posted";
export type ConfirmCommand = "POST" | "QUEUE";
export type PostingPlan = JournalPreviewDto & { key: string; command: ConfirmCommand };

export function useJournalState(initialEntryId: string | null) {
  const [status, setStatus] = useState<JournalStatus>(initialEntryId ? "posted" : "draft");
  const [draft, setDraft] = useState<JournalDraftDto | null>(null),
    [detail, setDetail] = useState<JournalDetailDto | null>(null);
  const [dirty, setDirty] = useState(false);
  const [plan, setPlan] = useState<PostingPlan | null>(null);
  const [queued, setQueued] = useState<BusinessResultDto | null>(null);
  const [receipt, setReceipt] = useState<JournalReceiptDto | null>(null),
    [notice, setNotice] = useState<"saved" | null>(null);
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [deleting, setDeleting] = useState(false);
  return {
    status,
    setStatus,
    draft,
    setDraft,
    detail,
    setDetail,
    dirty,
    setDirty,
    plan,
    setPlan,
    queued,
    setQueued,
    receipt,
    setReceipt,
    notice,
    setNotice,
    error,
    setError,
    busy,
    setBusy,
    uncertain,
    setUncertain,
    deleting,
    setDeleting,
  };
}
export type JournalState = ReturnType<typeof useJournalState>;

export function useEditorRefs() {
  const working = useRef(false),
    form = useRef<HTMLFormElement>(null),
    lineKeys = useRef<string[]>([]),
    returnFocus = useRef<HTMLElement | null>(null),
    focusLine = useRef<number | null>(null);
  return { working, form, lineKeys, returnFocus, focusLine };
}
export type EditorRefs = ReturnType<typeof useEditorRefs>;
