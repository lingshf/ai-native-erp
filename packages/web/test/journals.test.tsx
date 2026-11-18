import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalDraftDto, JournalPreviewDto, JournalEntryDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label } from "../src/ui/index.ts";
const company = {
  code: "DEFAULT",
  name: "Local",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "monthly-teaching",
  revision: 1,
};
const account = {
  code: "1000",
  name: "Cash",
  category: "ASSET",
  reportGroup: "cash",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  builtin: true,
  revision: 1,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const preview = (draft: JournalDraftDto): JournalPreviewDto => ({
  fingerprint: "a".repeat(64),
  plan: {
    version: 1,
    company: "DEFAULT",
    currency: "CNY",
    scale: 2,
    draftId: draft.id,
    draftRevision: draft.revision,
    sourceRef: draft.sourceRef,
    date: draft.date,
    memo: draft.memo,
    operation: draft.operation,
    originalId: draft.originalId,
    journals: [
      {
        kind: draft.kind,
        role: "normal",
        debit: 100,
        credit: 100,
        lines: draft.lines.map((line) => ({
          account: line.account,
          debit: line.debit ? 100 : 0,
          credit: line.credit ? 100 : 0,
          dimensions: {},
          dimensionOrigins: {},
          role: "business",
          suspense: null,
          historical: null,
          balancing: null,
          group: null,
        })),
      },
    ],
  },
});
const failure = (status: number, rule: string) =>
  response(
    {
      code: status === 409 ? "CONFLICT" : "INVALID_REQUEST",
      messageKey: "api.error.invalidRequest",
      params: {},
      fieldErrors: [{ path: "lines.0.debit", messageKey: `api.error.journals.${rule}` }],
      requestId: id(999),
      retryable: false,
    },
    status,
  );
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterAll(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => window.history.replaceState(null, "", "/#/journals"));
afterEach(() => window.history.replaceState(null, "", "/"));
describe("journal editor", () => {
  it("adds rows with Enter/Tab, retains preference state, previews explicitly and retries uncertain confirmation with the same identity", async () => {
    let saved: JournalDraftDto | undefined,
      posted = false;
    const confirmations: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        const url = new URL(String(path), "http://localhost");
        if (url.pathname === "/api/v1/companies")
          return response({ items: [company], nextCursor: null });
        if (url.pathname === "/api/v1/accounts")
          return response({ items: [account], nextCursor: null });
        if (url.pathname === "/api/v1/dimensions") return response({ items: [], nextCursor: null });
        if (url.pathname === "/api/v1/journals")
          return response({
            items: posted
              ? [
                  {
                    id: saved!.id,
                    date: saved!.date,
                    sourceRef: saved!.sourceRef,
                    memo: saved!.memo,
                    operation: "journal",
                    revision: null,
                  },
                ]
              : [],
            nextCursor: null,
          });
        const body = options?.body ? JSON.parse(String(options.body)) : undefined;
        if (url.pathname.endsWith("/preview")) return response(preview(saved!));
        if (url.pathname.endsWith("/confirm")) {
          confirmations.push(body);
          posted = true;
          if (confirmations.length === 1) throw new TypeError("Lost response after commit");
          return response({
            company: "DEFAULT",
            sourceRef: saved!.sourceRef,
            idempotencyKey: body.idempotencyKey,
            draftId: saved!.id,
            draftRevision: saved!.revision,
            fingerprint: body.fingerprint,
            operation: "journal",
            journalIds: [saved!.id],
            postedAt: "2026-01-15T10:00:00.000Z",
          });
        }
        if (body?.draft) {
          saved = { ...body.draft, revision: body.draft.revision + 1 };
          return response(saved);
        }
        const entry: JournalEntryDto = {
          ...preview(saved!).plan.journals[0],
          id: saved!.id,
          sourceRef: saved!.sourceRef,
          date: saved!.date,
          memo: saved!.memo,
          operation: "journal",
          postedAt: "2026-01-15T10:00:00.000Z",
          fingerprint: "a".repeat(64),
        };
        return response({ entry, chain: [] });
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "journal.new") }));
    const input = (key: "sourceRef" | "date" | "memo", value: string) =>
      fireEvent.change(screen.getByLabelText(label("zh", `journal.${key}`)), { target: { value } });
    input("sourceRef", "UI-1");
    input("date", "2026-01-15");
    input("memo", "Keep my input");
    const line = (n: number, field: "account" | "debit" | "credit", language: "zh" | "en" = "zh") =>
      screen.getByLabelText<HTMLInputElement>(
        `${label(language, "journal.line")} ${n} ${label(language, `journal.${field}`)}`,
      );
    fireEvent.change(line(1, "account"), { target: { value: "1000" } });
    fireEvent.change(line(1, "debit"), { target: { value: "1" } });
    fireEvent.change(line(2, "account"), { target: { value: "3000" } });
    fireEvent.change(line(2, "credit"), { target: { value: "1" } });
    fireEvent.keyDown(line(2, "credit"), { key: "Enter" });
    await waitFor(() => expect(document.activeElement).toBe(line(3, "account")));
    fireEvent.keyDown(line(3, "credit"), { key: "Tab" });
    await waitFor(() => expect(document.activeElement).toBe(line(4, "account")));
    fireEvent.click(screen.getByRole("button", { name: `${label("zh", "journal.remove")} 4` }));
    fireEvent.click(screen.getByRole("button", { name: `${label("zh", "journal.remove")} 3` }));
    fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
      target: { value: "en" },
    });
    expect(line(1, "debit", "en").value).toBe("1");
    expect(screen.getByLabelText<HTMLSelectElement>(label("en", "master.company")).disabled).toBe(
      true,
    );
    fireEvent.keyDown(line(1, "debit", "en"), { key: "Enter", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: label("en", "journal.previewTitle") });
    expect(confirmations).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "journal.confirm") }));
    await within(dialog).findByText(label("en", "journal.network"));
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", { name: label("en", "journal.back") })
        .disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "journal.confirm") }));
    await screen.findByText(label("en", "journal.postedNotice"));
    expect(confirmations).toHaveLength(2);
    expect(confirmations[0]).toEqual(confirmations[1]);
    fireEvent.click(
      screen.getAllByRole("button", { name: `${label("en", "journal.view")} ${saved!.id}` })[0],
    );
    fireEvent.click(await screen.findByRole("button", { name: label("en", "journal.reverse") }));
    expect(screen.getByLabelText<HTMLInputElement>(label("en", "journal.sourceRef")).value).toBe(
      "",
    );
    expect(screen.getByLabelText<HTMLInputElement>(label("en", "journal.date")).value).toBe("");
    expect(confirmations).toHaveLength(2);
  });
  it("loads bounded virtual pages and retains editable input after field validation and stale confirmation", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 1000, 480),
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let saved: JournalDraftDto = {
      id: id(1),
      revision: 1,
      sourceRef: "DRAFT-1",
      date: "2026-01-15",
      memo: "Retain this",
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines: [
        { account: "1000", debit: "1", credit: "", dimensions: {}, suspense: null },
        { account: "3000", debit: "", credit: "1", dimensions: {}, suspense: null },
      ],
    };
    let previews = 0,
      confirms = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        const url = new URL(String(path), "http://localhost");
        if (url.pathname === "/api/v1/companies")
          return response({ items: [company], nextCursor: null });
        if (url.pathname === "/api/v1/accounts")
          return response({ items: [account], nextCursor: null });
        if (url.pathname === "/api/v1/dimensions") return response({ items: [], nextCursor: null });
        if (url.pathname === "/api/v1/journals") {
          expect(url.searchParams.get("limit")).toBe("100");
          const second = url.searchParams.has("cursor");
          return response({
            items: Array.from({ length: 100 }, (_, index) => ({
              id: id(index + (second ? 101 : 1)),
              date: "2026-01-15",
              sourceRef: `DRAFT-${index + (second ? 101 : 1)}`,
              memo: "",
              operation: "journal",
              revision: 1,
            })),
            nextCursor: second ? null : id(100),
          });
        }
        if (url.pathname.endsWith("/preview")) {
          previews++;
          if (previews === 1) return failure(400, "money");
          if (previews === 2)
            return response(
              {
                code: "INVALID_REQUEST",
                messageKey: "api.error.invalidRequest",
                params: {},
                fieldErrors: [
                  { path: "lines.0.suspense", messageKey: "api.error.journals.suspense" },
                ],
                requestId: id(90),
                retryable: false,
              },
              400,
            );
          return response(preview(saved));
        }
        if (url.pathname.endsWith("/confirm")) {
          confirms++;
          return failure(409, "stale");
        }
        if (options?.body) {
          const body = JSON.parse(String(options.body));
          saved = { ...body.draft, revision: body.draft.revision + 1 };
        }
        return response(saved);
      }),
    );
    render(<App />);
    await screen.findByRole("button", { name: `${label("zh", "journal.edit")} DRAFT-1` });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("table", { name: label("zh", "journal.title") })
          .getAttribute("aria-rowcount"),
      ).toBe("201"),
    );
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
    fireEvent.click(screen.getByRole("button", { name: `${label("zh", "journal.edit")} DRAFT-1` }));
    const memo = await screen.findByLabelText<HTMLInputElement>(label("zh", "journal.memo"));
    fireEvent.change(memo, { target: { value: "Still mine" } });
    memo.focus();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.preview") }));
    await screen.findByText(label("zh", "journal.rule.money"), { exact: false });
    expect(memo.value).toBe("Still mine");
    await waitFor(() => expect(document.activeElement).toBe(memo));
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.preview") }));
    const owner = await screen.findByLabelText(label("zh", "journal.owner"));
    fireEvent.change(owner, { target: { value: "Local operator" } });
    fireEvent.change(screen.getByLabelText(label("zh", "journal.reason")), {
      target: { value: "Investigate" },
    });
    fireEvent.change(screen.getByLabelText(label("zh", "journal.reviewDate")), {
      target: { value: "2026-02-01" },
    });
    memo.focus();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.preview") }));
    let dialog = await screen.findByRole("dialog", { name: label("zh", "journal.previewTitle") });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(memo));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirms).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.preview") }));
    dialog = await screen.findByRole("dialog", { name: label("zh", "journal.previewTitle") });
    fireEvent.click(within(dialog).getByRole("button", { name: label("zh", "journal.confirm") }));
    await screen.findByText(label("zh", "journal.stale"), { exact: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(memo.value).toBe("Still mine");
    await waitFor(() => expect(document.activeElement).toBe(memo));
    expect(confirms).toBe(1);
  });
});
