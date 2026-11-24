import { type MouseEvent, useState } from "react";
import { MessageBar } from "../ui/components/index.tsx";
import { missingSelections } from "./settlement-items.ts";
import type { CommandItem, OpenItem, T } from "./settlement-model.ts";
import type { OpenItems } from "./use-open-items.ts";

// SettlementListToolbar's "Refresh list" button, which stays mounted outside the fieldset.
const REFRESH_BUTTON = "#tset-allocation-body .toolbar-row button";

// Selected item ids that are no longer open (D516): judged only while no request is in flight;
// during a fetch the last judgement stands (minus deselected items) so nothing flickers.
export function useSettledMissing(items: CommandItem[], rows: OpenItem[], page: OpenItems["page"]) {
  const [settled, setSettled] = useState<string[]>([]);
  const complete = page.isSuccess && !page.hasNextPage;
  const judged = page.isFetching ? settled : missingSelections(items, rows, complete);
  if (judged.join() !== settled.join()) setSettled(judged);
  return judged.filter((itemId) => items.some((item) => item.itemId === itemId));
}

type SettlementMissingNoticeProps = { t: T; count: number; onRemove: () => void };

export function SettlementMissingNotice({ t, count, onRemove }: SettlementMissingNoticeProps) {
  if (count === 0) return null;
  const remove = (event: MouseEvent<HTMLButtonElement>) => {
    // React only honours its own `disabled` prop, not the fieldset locked by a pending confirmation.
    if (event.currentTarget.matches(":disabled")) return;
    onRemove();
    document.querySelector<HTMLButtonElement>(REFRESH_BUTTON)?.focus();
  };
  return (
    <MessageBar tone="warning" role="status">
      <p>
        <strong>{count}</strong> {t("tset.missingNotice")}
      </p>
      <button type="button" className="btn btn-secondary" onClick={remove}>
        {t("tset.removeMissing")}
      </button>
    </MessageBar>
  );
}
