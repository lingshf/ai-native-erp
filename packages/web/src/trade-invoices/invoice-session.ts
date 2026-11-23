import { tradeInvoiceCommandSchema } from "@erp/core/contracts";
import { blankDraft, type Pending, type Saved } from "./invoice-model.ts";

// Drafts and an unresolved post envelope survive company switches, route changes and reloads in this tab.
const sessionKey = (company: string) => `erp.tradeInvoices.v1.${company}`;
export function loadSaved(company: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(company));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Saved> | null;
    if (
      !value ||
      typeof value.documentId !== "string" ||
      typeof value.draft !== "object" ||
      value.draft === null ||
      !Array.isArray(value.draft.lines) ||
      value.draft.lines.length === 0
    )
      return null;
    let pending: Pending | null = null;
    if (value.pending) {
      const command = tradeInvoiceCommandSchema.safeParse(value.pending.command);
      if (
        !command.success ||
        command.data.company !== company ||
        typeof value.pending.fingerprint !== "string" ||
        typeof value.pending.key !== "string"
      )
        return null;
      pending = { ...value.pending, command: command.data };
    }
    return {
      draft: { ...blankDraft(), ...value.draft },
      documentId: value.documentId,
      dirty: value.dirty === true,
      pending,
    };
  } catch {
    return null;
  }
}
// Returns whether sessionStorage now holds exactly this state (read back after writing).
export function storeSaved(company: string, saved: Saved): boolean {
  try {
    const key = sessionKey(company);
    if (!saved.dirty && !saved.pending) {
      window.sessionStorage.removeItem(key);
      return window.sessionStorage.getItem(key) === null;
    }
    const value = JSON.stringify(saved);
    window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) === value;
  } catch {
    return false;
  }
}
