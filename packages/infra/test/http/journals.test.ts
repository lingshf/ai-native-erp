import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { JournalService, MasterDataService } from "@erp/core/application";
import {
  errorSchema,
  journalDraftSchema,
  journalPreviewSchema,
  journalReceiptSchema,
  journalDetailSchema,
} from "@erp/core/contracts";
import { createApi } from "../../src/http/index.ts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
it("exposes strict journal DTOs, actionable field errors, immutable methods and an explicit POST confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "erp-journal-http-"));
  const config = { filename: join(directory, "ledger.sqlite") };
  const storage = createSqliteStorage(config);
  let api: Awaited<ReturnType<typeof createApi>> | undefined;
  let store: ReturnType<typeof createMasterDataStore> | undefined;
  const errors: unknown[] = [];
  try {
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    const masterData = new MasterDataService(store);
    await masterData.initialize(2026);
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData,
      journals: new JournalService(store, journalTools),
      logError: (event) => errors.push(event),
    });
    const base = await api.listen();
    const post = (path: string, payload: unknown) =>
      api!.app.inject({ method: "POST", url: `${base}/api/v1/journals/${path}`, payload });
    const created = await post("drafts", {
      company: "DEFAULT",
      draft: {
        id: randomUUID(),
        revision: 0,
        sourceRef: "HTTP-1",
        date: "2026-01-15",
        memo: "HTTP contract",
        kind: "normal",
        operation: "journal",
        originalId: null,
        headerDimensions: {},
        lines: [
          { account: "1000", debit: "1.001", credit: "", dimensions: {}, suspense: null },
          { account: "3000", debit: "", credit: "1", dimensions: {}, suspense: null },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const draft = journalDraftSchema.parse(created.json());
    const bad = await post("preview", {
      company: "DEFAULT",
      draftId: draft.id,
      revision: draft.revision,
    });
    expect(bad.statusCode).toBe(400);
    expect(errorSchema.parse(bad.json()).fieldErrors).toEqual([
      { path: "lines.0.debit", messageKey: "api.error.journals.money" },
    ]);
    const saved = await api.app.inject({
      method: "PUT",
      url: `${base}/api/v1/journals/drafts/${draft.id}`,
      payload: {
        company: "DEFAULT",
        draft: {
          ...draft,
          lines: draft.lines.map((line) => ({ ...line, debit: line.debit ? "1" : "" })),
        },
      },
    });
    const updated = journalDraftSchema.parse(saved.json());
    const selection = { company: "DEFAULT", draftId: draft.id, revision: updated.revision };
    const preview = await post("preview", selection);
    const plan = journalPreviewSchema.parse(preview.json());
    const confirmation = {
      ...selection,
      fingerprint: plan.fingerprint,
      idempotencyKey: randomUUID(),
    };
    const missingConsent = await post("confirm", confirmation);
    expect(missingConsent.statusCode).toBe(400);
    errorSchema.parse(missingConsent.json());
    const accepted = await post("confirm", { ...confirmation, confirmation: "POST" });
    const receipt = journalReceiptSchema.parse(accepted.json());
    const detail = await api.app.inject({
      method: "GET",
      url: `${base}/api/v1/journals/${receipt.journalIds[0]}?company=DEFAULT`,
    });
    expect(journalDetailSchema.parse(detail.json()).entry.id).toBe(draft.id);
    const immutable = await api.app.inject({
      method: "DELETE",
      url: `${base}/api/v1/journals/${draft.id}`,
      payload: { company: "DEFAULT", revision: 1 },
    });
    expect(immutable.statusCode).toBe(405);
    expect(errorSchema.parse(immutable.json()).code).toBe("METHOD_NOT_ALLOWED");
    const stale = await post("confirm", {
      ...confirmation,
      fingerprint: "0".repeat(64),
      confirmation: "POST",
    });
    expect(stale.statusCode).toBe(409);
    expect(errorSchema.parse(stale.json()).fieldErrors[0].messageKey).toBe(
      "api.error.journals.source",
    );
    expect(errors.length).toBe(4);
    expect(JSON.stringify(errors)).not.toContain("SELECT");
  } finally {
    await api?.close();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
