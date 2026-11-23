import type { FormEvent } from "react";
import {
  tradeOrderCommandSchema,
  tradeOrderPreviewSchema,
  tradeOrderSchema,
  type CompanyDto,
} from "@erp/core/contracts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import type { T } from "./order-model.ts";
import {
  type Command,
  type Draft,
  blankLine,
  blankDraft,
  toCommand,
  stablePath,
  ruleKey,
} from "./order-draft.ts";
import { MAX_ORDER_LINES, type LineField } from "./order-entry-fields.tsx";
import type { OrderEntryState } from "./use-order-entry.ts";

// One render's state and props; every command reads this snapshot, as the inline closures did.
export type OrderEntryContext = OrderEntryState & {
  company: CompanyDto;
  t: T;
  linkOrder: string | null;
  onLink: (orderId: string | null) => void;
};

function editDraft(entry: OrderEntryContext, change: Partial<Draft>) {
  entry.setDraft((current) => ({ ...current, ...change }));
  entry.setDirty(true);
  entry.setSaved(null);
  entry.setPreview(null);
}

function editLine(entry: OrderEntryContext, index: number, field: LineField, value: string) {
  editDraft(entry, {
    lines: entry.draft.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
  });
}

function addLine(entry: OrderEntryContext) {
  const { lines } = entry.draft;
  if (lines.length >= MAX_ORDER_LINES) return;
  const used = new Set(lines.map((line) => line.lineId));
  let n = lines.length + 1;
  while (used.has(`L${n}`)) n += 1;
  editDraft(entry, { lines: [...lines, blankLine(n)] });
}

function removeLine(entry: OrderEntryContext, lineId: string) {
  editDraft(entry, { lines: entry.draft.lines.filter((line) => line.lineId !== lineId) });
  entry.setFailure(
    (current) =>
      current && {
        ...current,
        issues: current.issues.filter(
          (issue) => issue.path !== `line:${lineId}` && !issue.path.startsWith(`line:${lineId}.`),
        ),
      },
  );
}

function discardDraft(entry: OrderEntryContext) {
  if (entry.busy || !window.confirm(entry.t("tord.discardConfirm"))) return;
  entry.setDraft(blankDraft());
  entry.setDirty(false);
  entry.setFailure(null);
  entry.setPreview(null);
}

function failed(
  entry: OrderEntryContext,
  error: unknown,
  lines: Command["lines"],
  invalid: TradeOrderKey,
  other: TradeOrderKey,
) {
  const fields = error instanceof MasterDataFailure ? (error.detail?.fieldErrors ?? []) : [];
  const definite =
    error instanceof MasterDataFailure && error.kind === "http" && (error.status ?? 500) < 500;
  entry.setFailure({
    message: fields.length ? entry.t(invalid) : entry.t(definite ? "tord.issue.other" : other),
    issues: fields.map((field) => ({
      path: stablePath(field.path, lines),
      key: ruleKey(field.messageKey),
    })),
    uncertain: !definite,
  });
}

function checkedCommand(entry: OrderEntryContext, invalid: TradeOrderKey) {
  const command = toCommand(entry.company, entry.draft);
  const checked = tradeOrderCommandSchema.safeParse(command);
  if (checked.success) return checked.data;
  entry.setFailure({
    message: entry.t(invalid),
    issues: checked.error.issues.map((issue) => ({
      path: stablePath(issue.path.join("."), command.lines),
      key: "tord.issue.shape",
    })),
    uncertain: false,
  });
  return null;
}

async function runPreview(entry: OrderEntryContext) {
  if (entry.busy) return;
  const command = checkedCommand(entry, "tord.previewInvalid");
  if (!command) {
    entry.setPreviewFocus({ to: "button" });
    return;
  }
  entry.setWorking("preview");
  entry.setFailure(null);
  entry.setSaved(null);
  try {
    entry.setPreview(
      await masterRequest("/api/v1/trade/orders/preview", tradeOrderPreviewSchema, {
        method: "POST",
        body: command,
      }),
    );
    entry.setPreviewFocus({ to: "result" });
  } catch (error) {
    entry.setPreview(null);
    failed(entry, error, command.lines, "tord.previewInvalid", "tord.previewFailed");
    entry.setPreviewFocus({ to: "button" });
  } finally {
    entry.setWorking(null);
  }
}

async function saveOrder(entry: OrderEntryContext, event: FormEvent) {
  event.preventDefault();
  if (entry.busy) return;
  const command = checkedCommand(entry, "tord.invalid");
  if (!command) return;
  entry.setWorking("save");
  entry.setFailure(null);
  try {
    const order = await masterRequest("/api/v1/trade/orders", tradeOrderSchema, {
      method: "POST",
      body: command,
    });
    entry.setSaved(order);
    entry.setPreview(null);
    entry.setDraft(blankDraft());
    entry.setDirty(false);
    void entry.client.resetQueries({ queryKey: ["trade-orders", entry.company.code] });
  } catch (error) {
    failed(entry, error, command.lines, "tord.invalid", "tord.uncertain");
  } finally {
    entry.setWorking(null);
  }
}

// Reads this render's linkOrder: an order already in the address only needs the lookup re-run.
function openOrder(entry: OrderEntryContext, orderId: string, focus: boolean) {
  if (orderId === entry.linkOrder) entry.setOpened({ orderId, focus });
  else {
    entry.focusNext.current = focus;
    entry.onLink(orderId);
  }
}

export function bindOrderCommands(entry: OrderEntryContext) {
  return {
    edit: (change: Partial<Draft>) => editDraft(entry, change),
    editLine: (index: number, field: LineField, value: string) =>
      editLine(entry, index, field, value),
    addLine: () => addLine(entry),
    removeLine: (lineId: string) => removeLine(entry, lineId),
    discard: () => discardDraft(entry),
    preview: () => runPreview(entry),
    save: (event: FormEvent) => saveOrder(entry, event),
    open: (orderId: string, focus: boolean) => openOrder(entry, orderId, focus),
  };
}
export type OrderCommands = ReturnType<typeof bindOrderCommands>;
