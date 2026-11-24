import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BusinessEventDto, BusinessPreviewDto, BusinessResultDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label } from "../src/ui/index.ts";

const company = {
  code: "DEFAULT",
  name: "Local",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const id = "10000000-0000-4000-8000-000000000000";
const createdAt = "2026-01-15T10:00:00.000Z";
const response = (body: unknown) => new Response(JSON.stringify(body));
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
afterEach(() => window.history.replaceState(null, "", "/"));

it("previews current cash input without saving, preserves preferences and retries unknown event/withdrawal results without changing commands", async () => {
  window.history.replaceState(null, "", "/#/events");
  const confirmations: unknown[] = [],
    withdrawals: unknown[] = [];
  let event: BusinessEventDto | undefined;
  const plan = (input: BusinessEventDto): BusinessPreviewDto => ({
    fingerprint: "a".repeat(64),
    statistics: null,
    clearing: [],
    matches: ["cash", "offset"].map((meaning) => ({
      meaning: meaning === "cash" ? "cash" : "offset",
      rule: meaning.toUpperCase(),
      revision: 1,
      account: meaning === "cash" ? "1000" : "4000",
      candidates: [{ objectScope: "all", partyScope: "all", count: 1 }],
    })),
    plan: {
      version: 1,
      company: "DEFAULT",
      currency: "CNY",
      scale: 2,
      draftId: input.id,
      draftRevision: 0,
      sourceRef: input.sourceRef,
      date: input.date,
      documentDate: input.date,
      taxDate: input.date,
      module: null,
      memo: input.memo,
      operation: "journal",
      originalId: null,
      journals: [
        {
          kind: "normal",
          role: "normal",
          debit: 1234,
          credit: 1234,
          lines: ["1000", "4000"].map((account, index) => ({
            account,
            debit: index ? 0 : 1234,
            credit: index ? 1234 : 0,
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
  const result = (input: BusinessEventDto, key: string): BusinessResultDto => ({
    event: input,
    preview: plan(input),
    createdAt,
    status: "posted",
    journalIds: [input.id],
    queue: null,
    receipt: {
      company: "DEFAULT",
      sourceRef: input.sourceRef,
      idempotencyKey: key,
      draftId: input.id,
      draftRevision: 0,
      fingerprint: "a".repeat(64),
      operation: input.operation,
      module: null,
      journalIds: [input.id],
      postedAt: createdAt,
    },
  });
  let queueStatus: "pending" | "withdrawn" = "pending";
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/services")
        return response({
          items: [
            {
              code: "S",
              name: "Consulting",
              group: "G",
              active: true,
              revision: 1,
              dimensions: {},
            },
          ],
          nextCursor: null,
        });
      if (url.pathname === "/api/v1/events/preview") {
        event = body.event;
        return response(plan(body.event));
      }
      if (url.pathname === "/api/v1/events/confirm") {
        confirmations.push(body);
        if (confirmations.length === 1) throw new TypeError("Lost committed response");
        return response(result(body.event, body.idempotencyKey));
      }
      if (url.pathname === "/api/v1/transfer-queue")
        return response({
          items:
            queueStatus === "pending"
              ? [
                  {
                    id,
                    sourceRef: "QUEUED",
                    date: "2026-01-15",
                    memo: "Queued",
                    createdAt,
                    status: "pending",
                    revision: 1,
                    journalIds: [],
                    fingerprint: null,
                    error: null,
                    reason: null,
                  },
                ]
              : [],
          nextCursor: null,
        });
      if (url.pathname.endsWith("/withdraw")) {
        withdrawals.push(body);
        queueStatus = "withdrawn";
        if (withdrawals.length === 1) throw new TypeError("Lost withdrawal response");
        const source = {
          id,
          revision: 1,
          sourceRef: "QUEUED",
          date: "2026-01-15",
          memo: "Queued",
          operation: "journal" as const,
          originalId: null,
          kind: "normal" as const,
          headerDimensions: {},
          lines: [],
        };
        return response({
          ...result(event!, id),
          event: source,
          status: "withdrawn",
          journalIds: [],
          receipt: {
            ...result(event!, id).receipt,
            draftId: id,
            draftRevision: 1,
            sourceRef: "QUEUED",
            operation: "journal",
            journalIds: [],
          },
          queue: {
            id,
            sourceRef: "QUEUED",
            date: source.date,
            memo: source.memo,
            status: "withdrawn",
            createdAt,
            revision: 2,
            journalIds: [],
            fingerprint: null,
            plan: null,
            reason: body.reason,
            error: null,
          },
        });
      }
      if (options?.method && options.method !== "GET")
        throw new Error(`Unexpected write ${url.pathname}`);
      return response({ items: [], nextCursor: null });
    }),
  );
  render(<App />);
  const newCash = `${label("zh", "business.new")} · ${label("zh", "business.cash_service")}`;
  fireEvent.click(await screen.findByRole("button", { name: newCash }));
  expect(document.querySelector(".jv-event > legend")?.classList.contains("jv-legend")).toBe(true);
  for (const [key, value] of [
    ["sourceRef", "CASH-UI"],
    ["date", "2026-01-15"],
    ["memo", "Keep cash input"],
  ] as const)
    fireEvent.change(screen.getByLabelText(label("zh", `journal.${key}`)), { target: { value } });
  fireEvent.change(screen.getByLabelText(label("zh", "business.service")), {
    target: { value: "S" },
  });
  fireEvent.change(screen.getByLabelText(`${label("zh", "business.amount")} · CNY`), {
    target: { value: "12.34" },
  });
  fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
    target: { value: "en" },
  });
  fireEvent.change(screen.getByLabelText(label("en", "shell.theme")), {
    target: { value: "green" },
  });
  expect(
    screen.getByLabelText<HTMLInputElement>(`${label("en", "business.amount")} · CNY`).value,
  ).toBe("12.34");
  fireEvent.keyDown(screen.getByLabelText(`${label("en", "business.amount")} · CNY`), {
    key: "Enter",
    ctrlKey: true,
  });
  let dialog = await screen.findByRole("dialog", { name: label("en", "journal.previewTitle") });
  expect(dialog.querySelector(".journal-scroll")?.classList.contains("jv-rows")).toBe(true);
  expect(confirmations).toHaveLength(0);
  expect(event?.memo).toBe("Keep cash input");
  fireEvent.click(within(dialog).getByRole("button", { name: label("en", "business.confirm") }));
  await within(dialog).findByText(label("en", "journal.network"));
  expect(
    within(dialog).getByRole<HTMLButtonElement>("button", { name: label("en", "journal.back") })
      .disabled,
  ).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: label("en", "business.confirm") }));
  await screen.findByText(label("en", "business.done"));
  expect(confirmations).toHaveLength(2);
  expect(confirmations[0]).toEqual(confirmations[1]);
  fireEvent.click(screen.getByRole("button", { name: label("en", "business.queue") }));
  fireEvent.click(await screen.findByRole("button", { name: label("en", "business.withdraw") }));
  dialog = await screen.findByRole("dialog", { name: label("en", "business.withdraw") });
  const reason = within(dialog).getByLabelText<HTMLTextAreaElement>(label("en", "business.reason"));
  fireEvent.change(reason, { target: { value: "Wrong source" } });
  fireEvent.click(
    within(dialog).getByRole("button", { name: label("en", "business.withdrawConfirm") }),
  );
  await within(dialog).findByText(label("en", "journal.network"));
  expect(reason.disabled).toBe(true);
  expect(
    within(dialog).getByRole<HTMLButtonElement>("button", { name: label("en", "journal.back") })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: label("en", "journal.view") }).disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: label("en", "journal.preview") })
      .disabled,
  ).toBe(true);
  fireEvent.click(
    within(dialog).getByRole("button", { name: label("en", "business.withdrawConfirm") }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(withdrawals).toHaveLength(2);
  expect(withdrawals[0]).toEqual(withdrawals[1]);
});

it("keeps master settings locked while editing or saving and refocuses the first input when a duplicate save fails", async () => {
  window.history.replaceState(null, "", "/#/events");
  const saves: unknown[] = [];
  let answer: ((value: Response) => void) | undefined;
  // Called through a closure so the reset below does not narrow `answer` to undefined.
  const reply = (value: Response) => answer?.(value);
  const service = {
    code: "S",
    name: "Consulting",
    group: "G",
    active: true,
    revision: 1,
    dimensions: {},
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/services" && options?.method === "POST") {
        saves.push(JSON.parse(String(options.body)));
        return new Promise<Response>((resolve) => (answer = resolve));
      }
      if (url.pathname === "/api/v1/services")
        return response({ items: [service], nextCursor: null });
      if (options?.method && options.method !== "GET")
        throw new Error(`Unexpected write ${url.pathname}`);
      return response({ items: [], nextCursor: null });
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: label("zh", "business.settings") }));
  const kinds = (["services", "parties", "rules"] as const).map((kind) =>
    screen.getByRole<HTMLButtonElement>("button", { name: label("zh", `business.${kind}`) }),
  );
  const locked = () => kinds.map((kind) => kind.disabled);
  const field = (key: "code" | "name" | "group") =>
    screen.getByLabelText<HTMLInputElement>(label("zh", `business.${key}`));
  const cancel = () =>
    fireEvent.click(screen.getByRole("button", { name: label("zh", "journal.cancel") }));
  const edit = await screen.findByRole("button", { name: label("zh", "business.edit") });
  expect(locked()).toEqual([false, false, false]);

  fireEvent.click(screen.getByRole("button", { name: label("zh", "business.new") }));
  expect(locked()).toEqual([true, true, true]);
  expect(document.activeElement).toBe(field("code"));
  cancel();
  expect(locked()).toEqual([false, false, false]);

  fireEvent.click(edit);
  expect(locked()).toEqual([true, true, true]);
  expect(document.activeElement).toBe(field("name"));
  cancel();
  expect(locked()).toEqual([false, false, false]);

  fireEvent.click(screen.getByRole("button", { name: label("zh", "business.new") }));
  const code = field("code");
  for (const [key, value] of [
    ["code", "S"],
    ["name", "Duplicate"],
    ["group", "G"],
  ] as const)
    fireEvent.change(field(key), { target: { value } });
  const save = screen.getByRole<HTMLButtonElement>("button", {
    name: label("zh", "business.save"),
  });
  save.focus();
  fireEvent.click(save);
  await waitFor(() => expect(answer).toBeDefined());
  expect(save.matches(":disabled")).toBe(true);
  expect(locked()).toEqual([true, true, true]);
  // Focus when busy=false commits (fieldset re-enabled), before a later task (e.g. passive effects) can move it.
  // The error (catch) and busy=false (finally) may commit separately, so observe the fieldset, not the alert.
  const fieldset = save.closest("fieldset");
  let focusedAtUnlock: Element | null | undefined;
  const observer = new MutationObserver(() => {
    if (focusedAtUnlock === undefined && !fieldset?.disabled)
      focusedAtUnlock = document.activeElement;
  });
  if (fieldset) observer.observe(fieldset, { attributes: true, attributeFilter: ["disabled"] });
  reply(
    new Response(
      JSON.stringify({
        code: "CONFLICT",
        messageKey: "api.error.conflict",
        params: {},
        fieldErrors: [],
        requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
        retryable: false,
      }),
      { status: 409 },
    ),
  );
  await screen.findByRole("alert");
  await waitFor(() => expect(focusedAtUnlock).toBeDefined());
  observer.disconnect();
  expect(focusedAtUnlock).toBe(code);
  expect(document.activeElement).toBe(code);
  expect(save.matches(":disabled")).toBe(false);
  expect(locked()).toEqual([true, true, true]);

  answer = undefined;
  fireEvent.change(code, { target: { value: "S2" } });
  fireEvent.click(save);
  await waitFor(() => expect(answer).toBeDefined());
  expect(locked()).toEqual([true, true, true]);
  reply(response({ ...service, code: "S2", name: "Duplicate" }));
  await screen.findByText(label("zh", "business.saved"));
  expect(screen.queryByLabelText(label("zh", "business.code"))).toBeNull();
  // The saved status (then) and busy=false (finally) may commit separately; the lock is released after both.
  await waitFor(() => expect(locked()).toEqual([false, false, false]));
  expect(saves).toHaveLength(2);
});

it("refocuses the first rule input as soon as a duplicate posting rule save fails", async () => {
  window.history.replaceState(null, "", "/#/events");
  let answer: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/posting-rules" && options?.method === "POST")
        return new Promise<Response>((resolve) => (answer = resolve));
      if (options?.method && options.method !== "GET")
        throw new Error(`Unexpected write ${url.pathname}`);
      return response({ items: [], nextCursor: null });
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: label("zh", "business.settings") }));
  fireEvent.click(screen.getByRole("button", { name: label("zh", "business.rules") }));
  fireEvent.click(await screen.findByRole("button", { name: label("zh", "business.new") }));
  const field = (key: Parameters<typeof label>[1]) =>
    screen.getByLabelText<HTMLInputElement>(label("zh", key));
  const code = field("business.code");
  expect(document.activeElement).toBe(code);
  for (const [key, value] of [
    ["business.code", "CASH"],
    ["business.objectCode", "S"],
    ["journal.account", "1000"],
  ] as const)
    fireEvent.change(field(key), { target: { value } });
  const save = screen.getByRole<HTMLButtonElement>("button", {
    name: label("zh", "business.save"),
  });
  save.focus();
  fireEvent.click(save);
  await waitFor(() => expect(answer).toBeDefined());
  expect(save.matches(":disabled")).toBe(true);
  const fieldset = save.closest("fieldset");
  let focusedAtUnlock: Element | null | undefined;
  const observer = new MutationObserver(() => {
    if (focusedAtUnlock === undefined && !fieldset?.disabled)
      focusedAtUnlock = document.activeElement;
  });
  if (fieldset) observer.observe(fieldset, { attributes: true, attributeFilter: ["disabled"] });
  answer?.(
    new Response(
      JSON.stringify({
        code: "CONFLICT",
        messageKey: "api.error.conflict",
        params: {},
        fieldErrors: [],
        requestId: "5c0a8f0e-3f3b-4d8e-9a43-2f6f0f7f1b21",
        retryable: false,
      }),
      { status: 409 },
    ),
  );
  await screen.findByRole("alert");
  await waitFor(() => expect(focusedAtUnlock).toBeDefined());
  observer.disconnect();
  expect(focusedAtUnlock).toBe(code);
  expect(document.activeElement).toBe(code);
});

it("leaves focus on the page after a posting rule form closes by cancel or successful save, like master settings", async () => {
  window.history.replaceState(null, "", "/#/events");
  let answer: ((value: Response) => void) | undefined;
  let saved: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/posting-rules" && options?.method === "POST") {
        saved = (JSON.parse(String(options.body)) as { value: unknown }).value;
        return new Promise<Response>((resolve) => (answer = resolve));
      }
      if (options?.method && options.method !== "GET")
        throw new Error(`Unexpected write ${url.pathname}`);
      return response({ items: [], nextCursor: null });
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: label("zh", "business.settings") }));
  fireEvent.click(screen.getByRole("button", { name: label("zh", "business.rules") }));
  const create = await screen.findByRole("button", { name: label("zh", "business.new") });
  const field = (key: Parameters<typeof label>[1]) =>
    screen.getByLabelText<HTMLInputElement>(label("zh", key));

  fireEvent.click(create);
  expect(document.activeElement).toBe(field("business.code"));
  const cancel = screen.getByRole("button", { name: label("zh", "journal.cancel") });
  cancel.focus();
  fireEvent.click(cancel);
  expect(screen.queryByLabelText(label("zh", "business.code"))).toBeNull();
  expect(document.activeElement).toBe(document.body);

  fireEvent.click(create);
  expect(document.activeElement).toBe(field("business.code"));
  for (const [key, value] of [
    ["business.code", "NEW"],
    ["business.objectCode", "S"],
    ["journal.account", "1000"],
  ] as const)
    fireEvent.change(field(key), { target: { value } });
  const save = screen.getByRole("button", { name: label("zh", "business.save") });
  save.focus();
  fireEvent.click(save);
  await waitFor(() => expect(answer).toBeDefined());
  answer?.(response({ ...(saved as object), revision: 1 }));
  await screen.findByText(label("zh", "business.saved"));
  expect(screen.queryByLabelText(label("zh", "business.code"))).toBeNull();
  await waitFor(() => expect(create.matches(":disabled")).toBe(false));
  expect(document.activeElement).toBe(document.body);
});

it("shows the page description verbatim in zh and en whether teaching is off or on (UI-16)", async () => {
  window.history.replaceState(null, "", "/#/events");
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
    zh: "维护服务、往来方与过账规则，录入业务事件并处理待转队列。",
    en: "Maintain services, parties and posting rules, record business events and process the transfer queue.",
  };
  expect(Array.from(expected.zh).length).toBeLessThanOrEqual(40);
  expect(expected.en.length).toBeLessThanOrEqual(120);
  const { container } = render(<App />);
  await screen.findByRole("heading", { level: 2, name: label("zh", "business.title") });
  const assertHeader = (language: "zh" | "en", teaching: boolean) => {
    const heading = screen.getByRole("heading", {
      level: 2,
      name: label(language, "business.title"),
    });
    const description = heading.nextElementSibling;
    expect(description?.tagName).toBe("P");
    expect(description?.textContent).toBe(expected[language]);
    expect(label(language, "business.description")).toBe(expected[language]);
    const tips = [...container.querySelectorAll("aside.teaching-tip")].filter(
      (tip) => tip.getAttribute("aria-label") === label(language, "business.teachingTitle"),
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
// TLIST-05: "Refresh list" re-reads page one of the current business events or transfer queue list.
const PAGE_SIZE = 100;
const PAGE_ROWS = PAGE_SIZE + 1; // aria-rowcount counts the header row.
const QUEUE_ROWS = 2; // one queue row per status plus the header row.
const REFRESH_TEXT = { zh: "刷新列表", en: "Refresh list" } as const;
const eventRows = (page: number) =>
  Array.from({ length: PAGE_SIZE }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(page * PAGE_SIZE + index).padStart(12, "0")}`,
    sourceRef: `EV-${String(page * PAGE_SIZE + index).padStart(3, "0")}`,
    date: "2026-01-15",
    memo: "Event",
    operation: "journal",
    status: "posted",
    createdAt,
  }));
const eventPage = (next: boolean) =>
  response({ items: eventRows(next ? 1 : 0), nextCursor: next ? null : "EV-099" });
const queuePage = (status: string | null) =>
  response({
    items: [
      { id, sourceRef: `Q-${status}`, date: "2026-01-15", memo: "Queued", createdAt, status },
    ].map((row) => ({
      ...row,
      revision: 1,
      journalIds: [],
      fingerprint: null,
      error: null,
      reason: null,
    })),
    nextCursor: null,
  });
// Two event pages and one queue row per status; `answer` may override an events reply. Reads are recorded.
function stubEventPages(answer?: () => Promise<Response> | undefined) {
  window.history.replaceState(null, "", "/#/events");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 480),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const reads: { url: URL; signal: AbortSignal }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/v1/companies")
      return response({ items: [company], nextCursor: null });
    reads.push({ url, signal: init.signal as AbortSignal });
    if (url.pathname === "/api/v1/transfer-queue") return queuePage(url.searchParams.get("status"));
    if (url.pathname !== "/api/v1/events") return response({ items: [], nextCursor: null });
    return (await answer?.()) ?? eventPage(url.searchParams.has("cursor"));
  });
  return reads;
}
const refreshButton = (language: "zh" | "en" = "zh") =>
  screen.getByRole<HTMLButtonElement>("button", { name: REFRESH_TEXT[language] });
const newCash = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: `${label("zh", "business.new")} · ${label("zh", "business.cash_service")}`,
  });
const statusSelect = () => document.querySelector(".jv-status select") as HTMLSelectElement;
const rowCount = () => screen.getByRole("table").getAttribute("aria-rowcount");
const readPath = ({ url }: { url: URL }) => `${url.pathname}${url.search}`;
const firstPage = (path: string, query = "") =>
  `/api/v1/${path}?company=${company.code}&limit=${PAGE_SIZE}${query}`;
const openView = (language: "zh" | "en", view: "business.queue" | "business.settings") =>
  fireEvent.click(screen.getByRole("button", { name: label(language, view) }));
// Clicks Refresh list; expects exactly one more read, of page one of `path`, shown alone.
async function expectOneReread(reads: { url: URL }[], path: string, query = "") {
  const from = reads.length;
  fireEvent.click(refreshButton());
  await waitFor(() => expect(reads.slice(from).map(readPath)).toEqual([firstPage(path, query)]));
  await waitFor(() => expect(rowCount()).toBe(String(path === "events" ? PAGE_ROWS : QUEUE_ROWS)));
}
describe("TLIST-05 business events refresh list", () => {
  it("L2: shows Refresh list before the events and queue tables in zh and en, not in settings or the editor list", async () => {
    stubEventPages();
    render(<App />);
    for (const language of ["zh", "en"] as const) {
      await screen.findByText("EV-000");
      expect(refreshButton(language).parentElement?.nextElementSibling?.className).toBe("card");
      openView(language, "business.queue");
      await screen.findByText("Q-pending");
      expect(refreshButton(language).parentElement?.nextElementSibling?.className).toBe("card");
      openView(language, "business.settings");
      expect(screen.queryByRole("button", { name: REFRESH_TEXT[language] })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: label(language, "business.title") }));
      if (language === "zh")
        fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
          target: { value: "en" },
        });
    }
    fireEvent.click(
      screen.getByRole("button", {
        name: `${label("en", "business.new")} · ${label("en", "business.clearing.match")}`,
      }),
    );
    for (const [key, value] of [
      ["journal.account", "1000"],
      ["journal.date", "2026-01-15"],
    ] as const)
      fireEvent.change(screen.getByLabelText(label("en", key)), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: label("en", "business.openItems") }));
    await screen.findByText(label("en", "business.empty"));
    expect(screen.getAllByRole("button", { name: REFRESH_TEXT.en })).toHaveLength(1);
  });
  it("L3: after two event pages, re-reads only the first page and offers Load more again", async () => {
    const reads = stubEventPages();
    render(<App />);
    await screen.findByText("EV-000");
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() => expect(rowCount()).toBe(String(2 * PAGE_SIZE + 1)));
    await expectOneReread(reads, "events");
    expect(screen.getAllByText("EV-000")).toHaveLength(1);
    expect(screen.getByRole("button", { name: label("zh", "master.loadMore") })).toBeTruthy();
  });
  it("L4 / L7: in the queue, the native button after the status filter re-reads only the chosen status", async () => {
    const reads = stubEventPages();
    render(<App />);
    await screen.findByText("EV-000");
    openView("zh", "business.queue");
    fireEvent.change(statusSelect(), { target: { value: "failed" } });
    await screen.findByText("Q-failed");
    expect(statusSelect().closest("label")?.nextElementSibling).toBe(refreshButton().parentElement);
    expect(refreshButton().outerHTML).toMatch(/^<button type="button" class="btn btn-secondary">/);
    await expectOneReread(reads, "transfer-queue", "&status=failed");
    expect(statusSelect().value).toBe("failed");
  });
  it("L5 / L7: refreshes with a dirty draft editor open, without asking or changing the editor", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const reads = stubEventPages();
    render(<App />);
    await screen.findByText("EV-000");
    fireEvent.click(newCash());
    const memo = screen.getByLabelText<HTMLInputElement>(label("zh", "journal.memo"));
    fireEvent.change(memo, { target: { value: "Unsaved draft" } });
    expect(newCash().parentElement?.nextElementSibling).toBe(refreshButton().parentElement);
    expect(refreshButton().disabled).toBe(false);
    expect(newCash().disabled).toBe(true);
    await expectOneReread(reads, "events");
    expect(screen.getByLabelText(label("zh", "journal.memo"))).toBe(memo);
    expect(memo.value).toBe("Unsaved draft");
    expect(confirm).not.toHaveBeenCalled();
  });
  it("L6: a second click cancels the first request and shows page one once; a failure shows the notice", async () => {
    const held: (() => void)[] = [];
    let answer: (() => Promise<Response>) | undefined;
    const reads = stubEventPages(() => answer?.());
    render(<App />);
    await screen.findByText("EV-000");
    answer = () => new Promise((resolve) => held.push(() => resolve(eventPage(false))));
    fireEvent.click(refreshButton());
    fireEvent.click(refreshButton());
    await waitFor(() => expect(held).toHaveLength(2));
    expect(reads.slice(-2).map(({ signal }) => signal.aborted)).toEqual([true, false]);
    for (const release of held) release();
    await waitFor(() => expect(rowCount()).toBe(String(PAGE_ROWS)));
    expect(screen.getAllByText("EV-000")).toHaveLength(1);
    answer = () => Promise.reject(new TypeError("offline"));
    fireEvent.click(refreshButton());
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: label("zh", "master.retry") })).toBeTruthy();
  });
});
