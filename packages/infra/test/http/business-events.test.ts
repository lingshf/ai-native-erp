import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { BusinessEventService, JournalService, MasterDataService } from "@erp/core/application";
import {
  businessMasterSchema,
  businessPreviewSchema,
  businessResultSchema,
  errorSchema,
  journalDetailSchema,
  postingRuleSchema,
  transferQueuePageSchema,
} from "@erp/core/contracts";
import { createApi } from "../../src/http/index.ts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";

it("enforces scoped strict event contracts, explicit confirmation, source ownership and terminal queue retries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "erp-business-http-"));
  const config = { filename: join(directory, "ledger.sqlite") };
  const storage = createSqliteStorage(config);
  let api: Awaited<ReturnType<typeof createApi>> | undefined;
  let store: ReturnType<typeof createMasterDataStore> | undefined;
  try {
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    const masterData = new MasterDataService(store);
    await masterData.initialize(2026);
    const journals = new JournalService(store, journalTools);
    const businessEvents = new BusinessEventService(store, journalTools);
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData,
      journals,
      events: businessEvents,
    });
    const base = await api.listen();
    const post = (path: string, payload: unknown) =>
      api!.app.inject({ method: "POST", url: `${base}/api/v1/${path}`, payload });
    const service = {
      code: "S",
      name: "Service",
      group: "G",
      active: true,
      revision: 0,
      dimensions: {},
    };
    expect(
      businessMasterSchema.parse(
        (await post("services", { company: "DEFAULT", value: service })).json(),
      ).revision,
    ).toBe(1);
    expect((await post("services", { company: "DEFAULT", value: service })).statusCode).toBe(409);
    for (const meaning of ["cash", "offset"] as const) {
      const rule = await post("posting-rules", {
        company: "DEFAULT",
        value: {
          code: meaning.toUpperCase(),
          revision: 0,
          active: true,
          direction: "receive",
          meaning,
          objectScope: "all",
          objectCode: "*",
          partyScope: "all",
          partyCode: "*",
          account: meaning === "cash" ? "1000" : "4000",
          dimensions: {},
          from: "2026-01-01",
          to: "2026-12-31",
        },
      });
      postingRuleSchema.parse(rule.json());
    }
    const event = {
      id: randomUUID(),
      operation: "cash_service",
      sourceRef: "HTTP-CASH",
      date: "2026-01-15",
      memo: "Cash contract",
      direction: "receive",
      service: "S",
      party: null,
      currency: "CNY",
      amount: "12.34",
      dimensions: {},
    };
    const preview = businessPreviewSchema.parse(
      (await post("events/preview", { company: "DEFAULT", event })).json(),
    );
    const input = {
      company: "DEFAULT",
      event,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    };
    for (const payload of [
      { ...input, confirmation: undefined },
      { ...input, actor: "REMOTE" },
    ]) {
      const rejected = await post("events/confirm", payload);
      expect(rejected.statusCode).toBe(400);
      errorSchema.parse(rejected.json());
    }
    const origin = await api.app.inject({
      method: "POST",
      url: `${base}/api/v1/events/confirm`,
      headers: { origin: "https://example.invalid" },
      payload: input,
    });
    expect(origin.statusCode).toBe(403);
    const accepted = businessResultSchema.parse((await post("events/confirm", input)).json());
    expect(businessResultSchema.parse((await post("events/confirm", input)).json())).toEqual(
      accepted,
    );
    const detail = await api.app.inject({
      method: "GET",
      url: `${base}/api/v1/journals/${accepted.journalIds[0]}?company=DEFAULT`,
    });
    expect(journalDetailSchema.parse(detail.json()).businessEventId).toBe(event.id);
    const foreign = await api.app.inject({
      method: "GET",
      url: `${base}/api/v1/events/${event.id}?company=OTHER`,
    });
    expect(foreign.statusCode).toBe(404);
    const mutation = await api.app.inject({
      method: "DELETE",
      url: `${base}/api/v1/events/${event.id}`,
    });
    expect(mutation.statusCode).toBe(405);
    const draft = await journals.save("DEFAULT", {
      id: randomUUID(),
      revision: 0,
      sourceRef: "HTTP-QUEUE",
      date: "2026-01-15",
      memo: "Queue contract",
      operation: "journal",
      originalId: null,
      kind: "normal",
      headerDimensions: {},
      lines: [
        { account: "1000", debit: "1", credit: "", dimensions: {}, suspense: null },
        { account: "3000", debit: "", credit: "1", dimensions: {}, suspense: null },
      ],
    });
    const planned = await journals.preview("DEFAULT", draft);
    const queued = businessResultSchema.parse(
      (
        await post("transfer-queue", {
          company: "DEFAULT",
          draftId: draft.id,
          revision: draft.revision,
          fingerprint: planned.fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "QUEUE",
        })
      ).json(),
    );
    expect(queued).toMatchObject({ status: "pending", journalIds: [] });
    const list = await api.app.inject({
      method: "GET",
      url: `${base}/api/v1/transfer-queue?company=DEFAULT&status=pending&limit=1`,
    });
    expect(transferQueuePageSchema.parse(list.json()).items[0].id).toBe(draft.id);
    const withdraw = { company: "DEFAULT", reason: "Wrong source", confirmation: "WITHDRAW" };
    const withdrawn = businessResultSchema.parse(
      (await post(`transfer-queue/${draft.id}/withdraw`, withdraw)).json(),
    );
    expect(
      businessResultSchema.parse(
        (await post(`transfer-queue/${draft.id}/withdraw`, withdraw)).json(),
      ),
    ).toEqual(withdrawn);
    expect(
      (await post(`transfer-queue/${draft.id}/withdraw`, { ...withdraw, reason: "Different" }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await post(`transfer-queue/${draft.id}/confirm`, {
          company: "DEFAULT",
          fingerprint: planned.fingerprint,
          confirmation: "TRANSFER",
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await api?.close();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
