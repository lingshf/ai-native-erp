import { useCallback, useEffect, useRef } from "react";
import { journalDetailSchema, type CompanyDto, type JournalDetailDto } from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { companyParam } from "./journal-draft.ts";
import type { JournalState } from "./use-journal-state.ts";

type DetailSetters = Pick<JournalState, "setDetail" | "setReceipt" | "setError">;

/** Owns the posted-entry request: its AbortController and the mounted (`alive`) flag. */
export function useJournalDetail(
  company: CompanyDto,
  initialEntryId: string | null,
  { setDetail, setReceipt, setError }: DetailSetters,
) {
  const alive = useRef(true);
  const detailRequest = useRef<AbortController | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: setters are stable useState setters; the dependency list stays as in CompanyJournals before REFAC-03b.
  const loadDetail = useCallback(
    async (id: string, clearReceipt = false) => {
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      setError(undefined);
      let value: JournalDetailDto;
      try {
        value = await masterRequest(
          `/api/v1/journals/${encodeURIComponent(id)}?${companyParam(company.code)}`,
          journalDetailSchema,
          { signal: controller.signal },
        );
      } catch (error) {
        if (alive.current && !controller.signal.aborted) setError(error);
        return;
      }
      if (alive.current && !controller.signal.aborted) {
        setDetail(value);
        if (clearReceipt) setReceipt(null);
      }
    },
    [company.code],
  );
  useEffect(() => {
    if (initialEntryId) void loadDetail(initialEntryId);
    return () => detailRequest.current?.abort();
  }, [initialEntryId, loadDetail]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const cancelDetail = () => detailRequest.current?.abort();
  return { alive, loadDetail, cancelDetail };
}
