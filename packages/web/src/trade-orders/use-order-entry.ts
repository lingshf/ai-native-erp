import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  tradePageSchema,
  type CompanyDto,
  type TradeDto,
  type TradeOrderPreviewDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { type Order, type Guard, type Opened, idleGuard } from "./order-model.ts";
import { type Failure, blankDraft } from "./order-draft.ts";

function useOptions(company: string, kind: TradeDto["kind"]) {
  return useQuery({
    queryKey: ["trade-order-options", company, kind],
    refetchOnMount: true,
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/${kind}?company=${encodeURIComponent(company)}&limit=500`,
        tradePageSchema,
        { signal },
      ),
  });
}
export type OptionsQuery = ReturnType<typeof useOptions>;

// Every hook of the entry form, in the order OrderWorkspace has always called them.
export function useOrderEntryState(
  company: CompanyDto,
  linkOrder: string | null,
  onGuard: (guard: Guard) => void,
) {
  const [draft, setDraft] = useState(blankDraft);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<"save" | "preview" | null>(null);
  const busy = working !== null;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const [preview, setPreview] = useState<TradeOrderPreviewDto | null>(null);
  // Focus after a preview request ends: the result region on success, the Preview button on failure.
  const [previewFocus, setPreviewFocus] = useState<{ to: "result" | "button" } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // The address owns the opened order (TINV-03): a list click or lookup writes `order`, and every
  // change of `order` (click, deep link, Back) runs the lookup; a link or Back focuses the result.
  const focusNext = useRef(true);
  useEffect(() => {
    setOpened(linkOrder === null ? null : { orderId: linkOrder, focus: focusNext.current });
    focusNext.current = true;
  }, [linkOrder]);
  const client = useQueryClient();
  const savedNotice = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const previewResult = useRef<HTMLElement>(null);
  const parties = useOptions(company.code, "tradeParty");
  const products = useOptions(company.code, "tradeProduct");
  const taxes = useOptions(company.code, "taxCode");
  useLayoutEffect(() => onGuard({ busy, unsaved: dirty }), [onGuard, busy, dirty]);
  useLayoutEffect(() => () => onGuard(idleGuard), [onGuard]);
  // Layout effect: focus moves inside the commit, so the notice never appears with focus elsewhere (D92).
  useLayoutEffect(() => {
    if (saved) savedNotice.current?.focus();
  }, [saved]);
  useLayoutEffect(() => {
    if (previewFocus)
      (previewFocus.to === "result" ? previewResult : previewButton).current?.focus();
  }, [previewFocus]);
  return {
    draft,
    setDraft,
    dirty,
    setDirty,
    working,
    setWorking,
    busy,
    failure,
    setFailure,
    saved,
    setSaved,
    preview,
    setPreview,
    setPreviewFocus,
    opened,
    setOpened,
    focusNext,
    client,
    savedNotice,
    previewButton,
    previewResult,
    parties,
    products,
    taxes,
  };
}
export type OrderEntryState = ReturnType<typeof useOrderEntryState>;
