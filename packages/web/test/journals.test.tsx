import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    documentDate: draft.documentDate ?? draft.date,
    taxDate: draft.taxDate ?? draft.date,
    module: null,
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
it.each([
  ["zh", "没有凭证。"],
  ["en", "No journals."],
] as const)(
  "shows journal-specific empty drafts and posted lists in %s",
  async (language, empty) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path) =>
        response({
          items: String(path).includes("/companies") ? [company] : [],
          nextCursor: null,
        }),
      ),
    );
    render(<App />);
    if (language === "en")
      fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
    await screen.findByText(empty);
    expect(screen.queryByText(label(language, "master.empty"))).toBeNull();
    const status = screen.getByRole("combobox", { name: label(language, "journal.title") });
    expect(status.classList.contains("jv-select")).toBe(true);
    fireEvent.change(status, { target: { value: "posted" } });
    await screen.findByText(empty);
    expect(screen.queryByText(label(language, "master.empty"))).toBeNull();
  },
);
it("keeps AI candidate generation, discard and adoption nonmutating, cancels stale responses and gates teaching", async () => {
  let state: "valid" | "invalid" | "unavailable" | "busy" | "held" = "valid";
  let release: (response: Response) => void = () => {},
    signal: AbortSignal | null = null;
  const mutations: string[] = [];
  const candidate: JournalDraftDto = {
    id: id(88),
    revision: 0,
    sourceRef: "AI-SYNTHETIC",
    date: "2026-01-15",
    memo: "AI candidate",
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [
      { account: "1000", debit: "100", credit: "0", dimensions: {}, suspense: null },
      { account: "4000", debit: "0", credit: "100", dimensions: {}, suspense: null },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname.startsWith("/api/v1/ai/")) {
        if (state === "held")
          return new Promise((resolve) => {
            release = resolve;
            signal = options?.signal ?? null;
          });
        if (state === "unavailable" || state === "busy")
          return response(
            {
              code: state === "busy" ? "AI_BUSY" : "AI_UNAVAILABLE",
              messageKey: `api.error.ai.${state}`,
              params: {},
              fieldErrors: [],
              requestId: id(99),
              retryable: true,
            },
            state === "busy" ? 409 : 503,
          );
        if (url.pathname.endsWith("/explain"))
          return response({ text: "Synthetic snapshot explanation" });
        return response(
          state === "invalid"
            ? {
                status: "invalid",
                draft: candidate,
                rationale: "AI rationale",
                issues: [{ path: "lines", messageKey: "api.error.journals.balance" }],
              }
            : { status: "candidate", draft: candidate, rationale: "AI rationale" },
        );
      }
      if (options?.method) mutations.push(url.pathname);
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/accounts")
        return response({ items: [account], nextCursor: null });
      if (url.pathname === "/api/v1/dimensions" || url.pathname === "/api/v1/journals")
        return response({ items: [], nextCursor: null });
      return response({
        service: "ai-native-erp",
        contractVersion: "1",
        profile: "local",
        data: "configured",
      });
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "新建凭证" }));
  fireEvent.change(screen.getByLabelText("记账日期"), { target: { value: "2026-01-15" } });
  fireEvent.change(screen.getByLabelText("摘要"), { target: { value: "Manual input" } });
  fireEvent.change(screen.getByLabelText("业务描述"), { target: { value: "Synthetic revenue" } });
  const send = () => fireEvent.click(screen.getByRole("button", { name: "发送给 Copilot" }));
  send();
  await screen.findByRole("button", { name: "采纳为新草稿（仅填入）" });
  expect(screen.getByLabelText("摘要")).toHaveProperty("value", "Manual input");
  expect(mutations).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "放弃建议" }));
  expect(screen.queryByRole("button", { name: "采纳为新草稿（仅填入）" })).toBeNull();
  expect(screen.getByLabelText("业务描述")).toHaveProperty("value", "Synthetic revenue");
  send();
  fireEvent.click(await screen.findByRole("button", { name: "采纳为新草稿（仅填入）" }));
  expect(screen.getByLabelText("摘要")).toHaveProperty("value", "AI candidate");
  expect(screen.getByLabelText("行 2 科目")).toHaveProperty("value", "4000");
  expect(mutations).toEqual([]);
  fireEvent.change(screen.getByLabelText("业务描述"), { target: { value: "Keep this input" } });
  state = "held";
  send();
  await screen.findByRole("button", { name: "取消 AI 请求" });
  await waitFor(() => expect(signal).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "取消 AI 请求" }));
  expect(signal).toHaveProperty("aborted", true);
  await act(async () =>
    release(
      response({
        status: "candidate",
        draft: { ...candidate, memo: "LATE-CANDIDATE" },
        rationale: "Late",
      }),
    ),
  );
  expect(screen.queryByRole("button", { name: "采纳为新草稿（仅填入）" })).toBeNull();
  expect(screen.queryByText(/LATE-CANDIDATE/u)).toBeNull();
  expect(screen.getByLabelText("摘要")).toHaveProperty("value", "AI candidate");
  state = "invalid";
  send();
  await screen.findByText("此候选未通过校验，不能采纳。");
  expect(screen.getByText(/业务行的借贷合计必须一致/u)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "采纳为新草稿（仅填入）" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "放弃建议" }));
  state = "valid";
  const teaching = screen.getByRole<HTMLInputElement>("checkbox", { name: "显示教学说明" });
  if (!teaching.checked) fireEvent.click(teaching);
  fireEvent.change(screen.getByLabelText("AI 任务"), { target: { value: "explain" } });
  send();
  await screen.findByText("Synthetic snapshot explanation");
  fireEvent.click(screen.getByRole("checkbox", { name: "显示教学说明" }));
  await waitFor(() => expect(screen.queryByText("Synthetic snapshot explanation")).toBeNull());
  expect(screen.queryByRole("option", { name: "教学讲解" })).toBeNull();
  expect(screen.getByLabelText("AI 任务")).toHaveProperty("value", "draft");
  expect(screen.getByText(label("zh", "ai.boundary"))).toBeTruthy();
  state = "unavailable";
  send();
  await screen.findByText(/AI 不可用/u);
  expect(screen.getByLabelText("业务描述")).toHaveProperty("value", "Keep this input");
  state = "busy";
  send();
  await screen.findByText(/另一个 AI 请求仍在处理或清理/u);
  expect(screen.getByRole("button", { name: "保存草稿" })).toHaveProperty("disabled", false);
  expect(mutations).toEqual([]);
});
describe("journal editor", () => {
  it("adds rows with Enter/Tab, retains preference state, previews explicitly and retries uncertain confirmation with the same identity", async () => {
    let saved: JournalDraftDto | undefined,
      posted = false,
      writes = 0;
    const previews: JournalDraftDto[] = [];
    const confirmations: unknown[] = [];
    const queues: unknown[] = [];
    let eventOwned = false;
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
        if (url.pathname === "/api/v1/transfer-queue") {
          queues.push(body);
          if (queues.length === 1) throw new TypeError("Lost queue response");
          return response({
            event: saved,
            preview: { ...preview(saved!), matches: [], statistics: null, clearing: [] },
            receipt: {
              company: "DEFAULT",
              sourceRef: saved!.sourceRef,
              idempotencyKey: body.idempotencyKey,
              draftId: saved!.id,
              draftRevision: saved!.revision,
              fingerprint: body.fingerprint,
              operation: "journal",
              journalIds: [],
              postedAt: "2026-01-15T10:00:00.000Z",
            },
            createdAt: "2026-01-15T10:00:00.000Z",
            status: "pending",
            journalIds: [],
            queue: {
              id: saved!.id,
              sourceRef: saved!.sourceRef,
              date: saved!.date,
              memo: saved!.memo,
              status: "pending",
              createdAt: "2026-01-15T10:00:00.000Z",
              revision: 1,
              journalIds: [],
              fingerprint: null,
              plan: null,
              error: null,
              reason: null,
            },
          });
        }
        if (url.pathname.endsWith("/preview")) {
          previews.push(body.draft);
          return response(preview(body.draft));
        }
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
          writes++;
          saved = { ...body.draft, revision: body.draft.revision + 1 };
          return response(saved);
        }
        if (!saved) throw new Error("Missing saved mock journal");
        const entry: JournalEntryDto = {
          ...preview(saved!).plan.journals[0],
          id: saved!.id,
          sourceRef: saved!.sourceRef,
          date: saved!.date,
          documentDate: saved.documentDate ?? saved.date,
          taxDate: saved.taxDate ?? saved.date,
          module: null,
          memo: saved!.memo,
          operation: "journal",
          postedAt: "2026-01-15T10:00:00.000Z",
          fingerprint: "a".repeat(64),
        };
        return response({ entry, chain: [], businessEventId: eventOwned ? saved!.id : null });
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "journal.new") }));
    const input = (key: "sourceRef" | "date" | "memo", value: string) =>
      fireEvent.change(screen.getByLabelText(label("zh", `journal.${key}`)), { target: { value } });
    input("sourceRef", "UI-1");
    input("date", "2026-01-15");
    fireEvent.change(screen.getByLabelText("单据日期"), { target: { value: "2025-12-29" } });
    fireEvent.change(screen.getByLabelText("税日期"), { target: { value: "2026-03-01" } });
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
    fireEvent.submit(line(1, "debit", "en").closest("form")!);
    expect(writes).toBe(0);
    fireEvent.keyDown(line(1, "debit", "en"), { key: "Enter", ctrlKey: true });
    let dialog = await screen.findByRole("dialog", { name: label("en", "journal.previewTitle") });
    expect(confirmations).toHaveLength(0);
    expect(saved).toBeUndefined();
    expect(writes).toBe(0);
    expect(previews[0]).toMatchObject({ revision: 0, memo: "Keep my input" });
    expect(previews[0]).toMatchObject({ documentDate: "2025-12-29", taxDate: "2026-03-01" });
    expect(within(dialog).getByText(label("en", "journal.unsaved"))).toBeDefined();
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", {
        name: label("en", "journal.confirm"),
      }).disabled,
    ).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.save") }));
    await screen.findByText(label("en", "journal.saved"));
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.preview") }));
    dialog = await screen.findByRole("dialog", { name: label("en", "journal.previewTitle") });
    expect(writes).toBe(1);
    expect(previews[1].revision).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "journal.confirm") }));
    await within(dialog).findByText(label("en", "journal.network"));
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", { name: label("en", "journal.back") })
        .disabled,
    ).toBe(true);
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", {
        name: label("en", "business.enqueue"),
      }).disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "journal.confirm") }));
    await screen.findByText(label("en", "journal.postedNotice"));
    expect(confirmations).toHaveLength(2);
    expect(confirmations[0]).toEqual(confirmations[1]);
    expect(screen.getByRole("columnheader", { name: label("en", "journal.actions") })).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: `${label("en", "journal.view")} ${saved!.id}` })[0],
    );
    await screen.findByText("Document date: 2025-12-29 · Tax date: 2026-03-01");
    fireEvent.click(await screen.findByRole("button", { name: label("en", "journal.reverse") }));
    expect(screen.getByLabelText<HTMLInputElement>(label("en", "journal.sourceRef")).value).toBe(
      "",
    );
    expect(screen.getByLabelText<HTMLInputElement>(label("en", "journal.date")).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.cancel") }));
    eventOwned = true;
    fireEvent.click(
      screen.getAllByRole("button", { name: `${label("en", "journal.view")} ${saved!.id}` })[0],
    );
    await screen.findByRole("link", { name: label("en", "business.original") });
    expect(screen.queryByRole("button", { name: label("en", "journal.reverse") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.new") }));
    for (const [key, value] of [
      ["sourceRef", "QUEUE-UI"],
      ["date", "2026-01-15"],
      ["memo", "Queue only"],
    ] as const)
      fireEvent.change(screen.getByLabelText(label("en", `journal.${key}`)), { target: { value } });
    fireEvent.change(line(1, "account", "en"), { target: { value: "1000" } });
    fireEvent.change(line(1, "debit", "en"), { target: { value: "1" } });
    fireEvent.change(line(2, "account", "en"), { target: { value: "3000" } });
    fireEvent.change(line(2, "credit", "en"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.save") }));
    await screen.findByText(label("en", "journal.saved"));
    fireEvent.click(screen.getByRole("button", { name: label("en", "journal.preview") }));
    dialog = await screen.findByRole("dialog", { name: label("en", "journal.previewTitle") });
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "business.enqueue") }));
    await within(dialog).findByText(label("en", "journal.network"));
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", {
        name: label("en", "journal.confirm"),
      }).disabled,
    ).toBe(true);
    expect(writes).toBe(2);
    fireEvent.click(within(dialog).getByRole("button", { name: label("en", "business.enqueue") }));
    await screen.findByText(label("en", "business.enqueued"));
    expect(queues).toHaveLength(2);
    expect(queues[0]).toEqual(queues[1]);
    expect(confirmations).toHaveLength(2);
    expect(writes).toBe(2);
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
      confirms = 0,
      writes = 0;
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
          const current = JSON.parse(String(options?.body)).draft;
          expect(current.revision).toBe(saved.revision);
          expect(current.memo).toBe("Still mine");
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
          return response(preview(current));
        }
        if (url.pathname.endsWith("/confirm")) {
          confirms++;
          return failure(409, "stale");
        }
        if (options?.body) {
          writes++;
          const body = JSON.parse(String(options.body));
          saved = { ...body.draft, revision: body.draft.revision + 1 };
        }
        return response(saved);
      }),
    );
    render(<App />);
    const editDraft = await screen.findByRole("button", {
      name: `${label("zh", "journal.edit")} DRAFT-1`,
    });
    expect(editDraft.textContent).toBe(label("zh", "journal.edit"));
    expect(
      within(screen.getByRole("table", { name: label("zh", "journal.title") })).getByRole(
        "columnheader",
        { name: label("zh", "journal.actions") },
      ),
    ).toBeTruthy();
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
    expect(writes).toBe(0);
    expect(saved.revision).toBe(1);
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
    expect(writes).toBe(0);
    expect(saved.revision).toBe(1);
    expect(within(dialog).getByText(label("zh", "journal.unsaved"))).toBeDefined();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(memo));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirms).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.save") }));
    await screen.findByText(label("zh", "journal.saved"));
    expect(writes).toBe(1);
    expect(saved.revision).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.preview") }));
    dialog = await screen.findByRole("dialog", { name: label("zh", "journal.previewTitle") });
    fireEvent.click(within(dialog).getByRole("button", { name: label("zh", "journal.confirm") }));
    await screen.findByText(label("zh", "journal.stale"), { exact: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(memo.value).toBe("Still mine");
    await waitFor(() => expect(document.activeElement).toBe(memo));
    expect(confirms).toBe(1);
    expect(writes).toBe(1);
  });
});

it("labels the always-available list reload as refresh, not retry, and still reloads (JV-FIX-01)", async () => {
  window.history.replaceState(null, "", "/#/journals");
  let listReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const { pathname } = new URL(String(path), "http://localhost");
      if (pathname === "/api/v1/companies") return response({ items: [company], nextCursor: null });
      if (pathname === "/api/v1/journals") listReads++;
      return response({ items: [], nextCursor: null });
    }),
  );
  render(<App />);
  const refresh = await screen.findByRole("button", { name: "刷新列表" });
  expect(screen.queryByRole("button", { name: label("zh", "master.retry") })).toBeNull();
  await waitFor(() => expect(listReads).toBe(1));
  fireEvent.click(refresh);
  await waitFor(() => expect(listReads).toBe(2));
  fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
    target: { value: "en" },
  });
  expect(await screen.findByRole("button", { name: "Refresh list" })).toBeTruthy();
});

it("shows the page description verbatim in zh and en whether teaching is off or on (UI-16)", async () => {
  window.history.replaceState(null, "", "/#/journals");
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockImplementation(async (path) =>
        new URL(String(path), "http://localhost").pathname === "/api/v1/companies"
          ? response({ items: [company], nextCursor: null })
          : response({ items: [], nextCursor: null }),
      ),
  );
  const expected = {
    zh: "录入手工凭证草稿，预览并确认过账，再查看或反向已过账凭证。",
    en: "Enter manual journal drafts, preview and confirm posting, then review or reverse posted journals.",
  };
  expect(Array.from(expected.zh).length).toBeLessThanOrEqual(40);
  expect(expected.en.length).toBeLessThanOrEqual(120);
  const { container } = render(<App />);
  await screen.findByRole("heading", { level: 2, name: label("zh", "journal.title") });
  const assertHeader = (language: "zh" | "en", teaching: boolean) => {
    const heading = screen.getByRole("heading", {
      level: 2,
      name: label(language, "journal.title"),
    });
    const description = heading.nextElementSibling;
    expect(description?.tagName).toBe("P");
    expect(description?.textContent).toBe(expected[language]);
    expect(label(language, "journal.description")).toBe(expected[language]);
    const tips = [...container.querySelectorAll("aside.teaching-tip")].filter(
      (tip) => tip.getAttribute("aria-label") === label(language, "journal.teachingTitle"),
    );
    expect(tips).toHaveLength(teaching ? 1 : 0);
  };
  const switchTo = (from: "zh" | "en", to: "zh" | "en") =>
    fireEvent.change(screen.getByLabelText(label(from, "shell.language")), {
      target: { value: to },
    });
  for (const teaching of [false, true]) {
    if (teaching)
      fireEvent.click(screen.getByLabelText(label("zh", "shell.showTeachingExplanations")));
    assertHeader("zh", teaching);
    switchTo("zh", "en");
    assertHeader("en", teaching);
    switchTo("en", "zh");
  }
});
