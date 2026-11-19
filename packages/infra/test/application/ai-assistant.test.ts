import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  AiAssistantService,
  AiContextService,
  AiFailure,
  MasterDataService,
  JournalService,
  DimensionService,
  type AiPort,
  type MasterDataStore,
} from "@erp/core/application";
import { aiDraftResultSchema, aiExplainResultSchema, errorSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { createApi } from "../../src/http/index.ts";
let directory: string,
  filename: string,
  store: ReturnType<typeof createMasterDataStore>,
  master: MasterDataService;
let api: Awaited<ReturnType<typeof createApi>>, base: string, assistant: AiAssistantService;
let respond: AiPort["complete"], calls: Parameters<AiPort["complete"]>[0][];
const write = vi.fn<MasterDataStore["write"]>();
const logs: unknown[] = [];
const reads: { transaction: number; method: "accounts" | "balances" | "snapshot" | "closing" }[] =
  [];
let transaction = 0;
const input = { company: "AI", month: "2026-01", prompt: "Synthetic cash revenue" };
const proposal = () => ({
  date: "2026-01-15",
  memo: "Synthetic AI",
  kind: "normal",
  rationale: "Synthetic cash service",
  lines: [
    { account: "1000", debit: "100", credit: "0" },
    { account: "4000", debit: "0", credit: "100" },
  ],
});
const port: AiPort = {
  complete: (request, signal) => {
    calls.push(request);
    return respond(request, signal);
  },
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-ai-test-"));
  filename = join(directory, "ledger.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  store = createMasterDataStore({ filename });
  master = new MasterDataService(store);
  await master.initialize(2026);
  await master.createCompany({
    code: "AI",
    name: "Synthetic",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual",
  });
  calls = [];
  logs.length = 0;
  reads.length = 0;
  transaction = 0;
  respond = async () => JSON.stringify(proposal());
  write.mockReset();
  write.mockRejectedValue(new Error("AI must never open a write transaction"));
  const observed: MasterDataStore = {
    read: (work) =>
      store.read((repo) => {
        const current = ++transaction;
        const observe = (method: (typeof reads)[number]["method"]) => {
          reads.push({ transaction: current, method });
        };
        return work({
          ...repo,
          accounts: (company, query) => {
            observe("accounts");
            return repo.accounts(company, { ...query, limit: 2 });
          },
          reportBalances: (...args) => {
            observe("balances");
            return repo.reportBalances(...args);
          },
          reportSnapshot: (...args) => {
            observe("snapshot");
            return repo.reportSnapshot(...args);
          },
          closeState: (...args) => {
            observe("closing");
            return repo.closeState(...args);
          },
        });
      }),
    write,
  };
  const context = new AiContextService(observed);
  const previews = new JournalService(observed, journalTools);
  assistant = new AiAssistantService(
    { context: context.context.bind(context), preview: previews.preview.bind(previews) },
    port,
    journalTools,
    3000,
  );
  api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    masterData: master,
    assistant,
    logError: (event) => logs.push(event),
  });
  base = await api.listen();
});
afterEach(async () => {
  await api?.close();
  await store?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const send = (action = "draft", body: unknown = input, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/ai/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
function counts() {
  const db = new Database(filename, { readonly: true });
  try {
    return [
      "journal_drafts",
      "journal_entries",
      "journal_lines",
      "receipts",
      "audit",
      "business_events",
      "period_closes",
    ].map((table) => [table, db.prepare(`SELECT count(*) n FROM ${table}`).get()]);
  } finally {
    db.close();
  }
}
it("returns validated candidates without writes, rechecks late configuration and preserves normal journal/dimension rules", async () => {
  const journals = new JournalService(store, journalTools);
  await journals.save("AI", {
    id: randomUUID(),
    revision: 0,
    sourceRef: "PRIVATE-DRAFT",
    date: "2026-01-03",
    memo: "PRIVATE-DRAFT-CONTENT",
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [],
  });
  await master.saveAccount(
    "DEFAULT",
    {
      code: "4999",
      name: "OTHER-COMPANY-PRIVATE",
      category: "REVENUE",
      reportGroup: "sales",
      normalSide: "CREDIT",
      purpose: "general",
      controlModule: null,
      contraOf: null,
      manualAllowed: true,
      active: true,
    },
    0,
  );
  const before = counts();
  const result = aiDraftResultSchema.parse(await (await send()).json());
  expect(result.status).toBe("candidate");
  if (result.status !== "candidate") throw new Error("Missing candidate");
  expect(result.draft).toMatchObject({ revision: 0, operation: "journal", originalId: null });
  expect(result.draft.id).toMatch(/^[0-9a-f-]{36}$/u);
  expect(calls[0]?.context.company.code).toBe("AI");
  expect(reads.filter((read) => read.method === "balances")).toHaveLength(0);
  expect(reads.filter((read) => read.method === "closing")).toHaveLength(0);
  expect(reads.filter((read) => read.method === "accounts").length).toBeGreaterThan(1);
  const catalog = await master.accounts("AI", { limit: 500 });
  expect(calls[0]?.context.accounts.map((account) => account.code)).toEqual(
    catalog.items
      .filter((account) => account.active && account.manualAllowed)
      .map((account) => account.code),
  );
  expect(calls[0]?.context).not.toHaveProperty("report");
  expect(calls[0]?.context).not.toHaveProperty("closing");
  expect(JSON.stringify(calls)).not.toMatch(/PRIVATE-DRAFT|OTHER-COMPANY-PRIVATE/u);
  for (const candidate of [
    { ...proposal(), kind: "closing" },
    { ...proposal(), date: "2026-02-01" },
    { ...proposal(), lines: [{ account: 1000, debit: "100", credit: "0" }, proposal().lines[1]] },
    { ...proposal(), lines: [{ account: "1000", debit: "99", credit: "0" }, proposal().lines[1]] },
    { ...proposal(), lines: [{ account: "8888", debit: "100", credit: "0" }, proposal().lines[1]] },
    {
      ...proposal(),
      lines: [{ ...proposal().lines[0], dimensions: { bad: "value" } }, proposal().lines[1]],
    },
  ]) {
    respond = async () => JSON.stringify(candidate);
    const invalid = aiDraftResultSchema.parse(await (await send()).json());
    expect(invalid.status).toBe("invalid");
    if (invalid.status === "invalid") expect(invalid.issues.length).toBeGreaterThan(0);
  }
  const dimensions = new DimensionService(store),
    common = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
  await dimensions.save("AI", {
    ...common,
    kind: "dimension",
    code: "DEPT",
    name: "Synthetic department",
  });
  await dimensions.save("AI", {
    ...common,
    kind: "value",
    dimension: "DEPT",
    code: "OPS",
    name: "Synthetic operations",
  });
  const explicit = {
    ...proposal(),
    lines: proposal().lines.map((line) => ({ ...line, dimensions: { DEPT: "OPS" } })),
  };
  respond = async () => JSON.stringify(explicit);
  const inferred = aiDraftResultSchema.parse(await (await send()).json());
  expect(inferred.status).toBe("invalid");
  expect(inferred).toMatchObject({ issues: [{ messageKey: "api.error.ai.explicitDimensions" }] });
  expect(
    aiDraftResultSchema.parse(
      await (await send("draft", { ...input, prompt: "Synthetic cash DEPT=OPS" })).json(),
    ).status,
  ).toBe("candidate");
  await dimensions.save("AI", {
    ...common,
    kind: "structure",
    code: "4000",
    required: ["DEPT"],
    optional: [],
    forbidden: [],
    allowed: [{ DEPT: "OPS" }],
    fixed: {},
    conditionals: [],
  });
  respond = async () => JSON.stringify(proposal());
  expect(aiDraftResultSchema.parse(await (await send()).json()).status).toBe("invalid");
  respond = async () => JSON.stringify(explicit);
  expect(
    aiDraftResultSchema.parse(await (await send("draft", { ...input, prompt: "DEPT=OPS" })).json())
      .status,
  ).toBe("candidate");
  let release: (text: string) => void = () => {};
  respond = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const seen = calls.length,
    pending = send("draft", { ...input, prompt: "DEPT=OPS" });
  await vi.waitFor(() => expect(calls.length).toBe(seen + 1));
  expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
  const account = await master.account("AI", "4000");
  await master.saveAccount("AI", { ...account, active: false }, account.revision);
  release(JSON.stringify(explicit));
  expect(aiDraftResultSchema.parse(await (await pending).json())).toMatchObject({
    status: "invalid",
    issues: [{ path: "lines.1.account", messageKey: "api.error.journals.account" }],
  });
  respond = async () => JSON.stringify(proposal());
  expect(aiDraftResultSchema.parse(await (await send()).json()).status).toBe("invalid");
  expect(reads.filter((read) => read.method === "balances")).toHaveLength(0);
  reads.length = 0;
  respond = async () => "Snapshot explanation <not HTML>";
  expect(aiExplainResultSchema.parse(await (await send("explain")).json()).text).toContain(
    "Snapshot explanation",
  );
  expect(calls.at(-1)?.context).toHaveProperty("snapshot.accountRevision");
  expect(calls.at(-1)?.context).toHaveProperty("closing.drafts", 1);
  expect(reads.map((read) => read.method).sort()).toEqual(["balances", "closing", "snapshot"]);
  expect(new Set(reads.map((read) => read.transaction)).size).toBe(1);
  expect(JSON.stringify(calls.at(-1))).not.toContain("PRIVATE-DRAFT");
  expect(counts()).toEqual(before);
  expect(write).not.toHaveBeenCalled();
});
it("bounds timeout/cancellation, redacts failures, rejects HTTP boundary misuse and leaves manual endpoints available", async () => {
  respond = () => new Promise(() => {});
  const timed = new AiAssistantService(
    {
      context: (mode, input) =>
        new AiContextService({ read: (work) => store.read(work), write }).context(mode, input),
      preview: (company, draft) => new JournalService(store, journalTools).preview(company, draft),
    },
    port,
    journalTools,
    25,
  );
  const before = counts();
  await expect(timed.draft(input)).rejects.toMatchObject({ reason: "timeout" });
  const abort = new AbortController(),
    pending = timed.draft(input, abort.signal);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ reason: "cancelled" });
  let upstream: AbortSignal | undefined;
  respond = async (_request, signal) => {
    upstream = signal;
    return new Promise(() => {});
  };
  const browser = new AbortController();
  const disconnected = fetch(`${base}/api/v1/ai/draft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: browser.signal,
  });
  const rejected = expect(disconnected).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(upstream).toBeDefined());
  browser.abort();
  await rejected;
  await vi.waitFor(() => expect(upstream).toHaveProperty("aborted", true));
  for (const [reason, status] of [
    ["unavailable", 503],
    ["timeout", 504],
    ["busy", 409],
    ["response", 502],
    ["cleanup", 503],
  ] as const) {
    respond = async () => {
      throw new AiFailure(reason);
    };
    const response = await send();
    expect(response.status).toBe(status);
    expect(errorSchema.parse(await response.json())).toMatchObject({
      code: `AI_${reason.toUpperCase()}`,
      retryable: reason !== "response",
    });
  }
  respond = async () => {
    throw new Error("PRIVATE-PROMPT-AND-CREDENTIAL");
  };
  const failed = await send("draft", { ...input, prompt: "PRIVATE-PROMPT-AND-CREDENTIAL" });
  expect(failed.status).toBe(500);
  expect(JSON.stringify(await failed.json())).not.toContain("PRIVATE");
  expect(JSON.stringify(logs)).not.toContain("PRIVATE");
  const called = calls.length;
  expect((await send("draft", input, { origin: "https://foreign.example" })).status).toBe(403);
  expect((await send("draft", { ...input, confirmation: "POST" })).status).toBe(400);
  expect((await send("draft", input, { "content-type": "text/plain" })).status).toBe(415);
  expect((await fetch(`${base}/api/v1/ai/draft`)).status).toBe(405);
  expect(calls.length).toBe(called);
  const bare = await createApi({ environment: { ERP_PORT: "0" }, allowPortZero: true });
  try {
    const address = await bare.listen();
    expect(
      (
        await fetch(`${address}/api/v1/ai/draft`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(503);
  } finally {
    await bare.close();
  }
  expect((await fetch(`${base}/api/v1/companies`)).status).toBe(200);
  expect(counts()).toEqual(before);
  expect(write).not.toHaveBeenCalled();
});
