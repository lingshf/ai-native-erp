import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
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
