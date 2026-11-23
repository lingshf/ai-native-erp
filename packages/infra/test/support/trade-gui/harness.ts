// Per-file Vite build and Chrome, server provisioning, traced pages and cleanup.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { build } from "vite";
import { MasterDataService } from "@erp/core/application";
import { createSqliteStorage } from "../../../src/storage/index.ts";
import { createMasterDataStore } from "../../../src/storage/master-data.ts";
import { SqliteExecutor } from "../../../src/workers/executor.ts";
import { createApi, type LocalApi } from "../../../src/http/index.ts";
import { type Diagnostic, timed, watchRequests } from "./diagnostics.ts";
import { artifacts, root } from "./paths.ts";

type Phase = (name: string, started: number) => void;
export type Server = { executor: SqliteExecutor; api?: LocalApi };

// One Vite build and one Chrome per file. Chrome starts while Vite builds and the test
// provisions its database and API; all of it still runs inside the Vitest Duration.
export function guiHarness(phase: Phase, log: Diagnostic | undefined) {
  const harness = {
    directory: "",
    webRoot: "",
    browser: undefined as Browser | undefined,
    launching: undefined as unknown as Promise<Browser>,
  };
  beforeAll(async () => {
    harness.directory = await mkdtemp(join(tmpdir(), "erp-trade-gui-"));
    harness.webRoot = join(harness.directory, "web");
    await mkdir(artifacts, { recursive: true });
    const launchStarted = performance.now();
    log?.("step", { step: "launch", phase: "start" });
    harness.launching = chromium
      .launch({ headless: true, channel: process.env.ERP_E2E_BROWSER_CHANNEL })
      .then((launched) => {
        harness.browser = launched;
        log?.("step", { step: "launch", phase: "end" });
        if (log) launched.on("disconnected", () => log("browser-disconnected"));
        phase("browser", launchStarted);
        return launched;
      });
    harness.launching.catch(
      log
        ? (error) => log("step", { step: "launch", phase: "error", error: String(error) })
        : () => {},
    );
    const started = performance.now();
    await timed(log, "build", () =>
      build({
        root: join(root, "packages/web"),
        configFile: join(root, "packages/web/vite.config.ts"),
        logLevel: "error",
        build: { outDir: harness.webRoot },
      }),
    );
    phase("build", started);
  }, 60_000);
  afterAll(async () => {
    try {
      await timed(log, "afterAll:launching", () => harness.launching?.catch(() => undefined));
      const started = performance.now();
      await timed(log, "afterAll:browser.close", () => harness.browser?.close());
      phase("browser-close", started);
    } finally {
      if (harness.directory)
        await timed(log, "afterAll:rm", () =>
          rm(harness.directory, { recursive: true, force: true }),
        );
    }
  });
  return harness;
}

export async function provisionServer(
  harness: { directory: string; webRoot: string },
  servers: Server[],
  phase: Phase,
  file: string,
  prefix: string,
) {
  const filename = join(harness.directory, `${file}.sqlite`);
  let started = performance.now();
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const store = createMasterDataStore({ filename });
  try {
    const master = new MasterDataService(store);
    await master.initialize(2026);
    // Only prerequisite GL accounts are provisioned; trade configuration and all
    // financial commands below go through the rendered application.
    for (const [code, category, reportGroup, controlModule] of [
      ["2100", "LIABILITY", "payables", "AP"],
      ["1250", "ASSET", "prepayments", "AP"],
      ["1300", "ASSET", "receivables", "AR"],
      ["2300", "LIABILITY", "otherLiabilities", "AR"],
      ["1400", "ASSET", "otherAssets", "TAX"],
      ["2200", "LIABILITY", "taxLiabilities", "TAX"],
    ] as const)
      await master.saveAccount(
        "DEFAULT",
        {
          code,
          name: `Fictional ${code}`,
          category,
          reportGroup,
          controlModule,
          purpose: "control",
          normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
          contraOf: null,
          active: true,
          manualAllowed: false,
        },
        0,
      );
  } finally {
    await store.close();
  }
  phase(`${prefix}database`, started);
  started = performance.now();
  const server: Server = { executor: await SqliteExecutor.create({ filename }) };
  servers.push(server);
  server.api = await createApi({
    ...server.executor.services(),
    webRoot: harness.webRoot,
    allowPortZero: true,
    environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
  });
  phase(`${prefix}api`, started);
  return await server.api.listen();
}

export async function closeAll(context: BrowserContext | undefined, servers: Server[]) {
  // Explicit context close also disposes the Node request pool used by route.fetch().
  const closed = [await Promise.allSettled([context?.close()])].flat();
  closed.push(
    ...(await Promise.allSettled(
      servers.map(async ({ executor, api }) => {
        try {
          await api?.close();
        } finally {
          await executor.close();
        }
      }),
    )),
  );
  for (const result of closed) if (result.status === "rejected") throw result.reason;
}

export async function openTracedPage(
  launching: Promise<Browser>,
  phase: Phase,
  created: (context: BrowserContext) => void,
  log: Diagnostic | undefined,
  name: string,
) {
  const launched = await launching;
  let started = performance.now();
  const context = await launched.newContext({ viewport: { width: 1440, height: 1100 } });
  created(context);
  phase("context", started);
  started = performance.now();
  // Keystroke, network and source evidence without DOM snapshots; written only on failure.
  await context.tracing.start({ screenshots: false, snapshots: false, sources: true });
  phase("tracing", started);
  started = performance.now();
  const page = await context.newPage();
  if (log) watchRequests(page, log, { test: name });
  phase("page", started);
  return { context, page };
}

// The trace is kept only for a failure (CI uploads artifacts only then). Main path screenshots
// stay on success as the local UI evidence; smoke screens are written only on failure.
export async function finishTrace(
  context: BrowserContext,
  page: Page,
  name: string,
  failed: boolean,
  screenshot = failed,
) {
  if (screenshot)
    await page.screenshot({ path: join(artifacts, `${name}-last.png`), fullPage: true });
  await context.tracing.stop(failed ? { path: join(artifacts, `${name}-trace.zip`) } : undefined);
}
