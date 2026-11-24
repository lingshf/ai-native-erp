import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ApplicationServices } from "@erp/core/application";
import { DomainError } from "@erp/core/domain";
import { createApi } from "../../src/http/index.ts";
import { openingItemId } from "../../src/legacy/opening-items.ts";

// BUG-03a / BUG-03b (D565): every REFAC-34 trade document GET route checks, in order,
// local origin and method (403/405) → service configured (503) → query and path id (400).
type TradeDocs = NonNullable<ApplicationServices["tradeDocs"]>;
type StubMethod = "report" | "reconciliation" | "itemDetail" | "actions" | "detail";

interface Route {
  readonly name: string;
  readonly method: StubMethod;
  readonly path: (id: string) => string;
  readonly takesId: boolean;
}

const routes: readonly Route[] = [
  {
    name: "GET /trade/reports/open-items",
    method: "report",
    path: () => "/api/v1/trade/reports/open-items",
    takesId: false,
  },
  {
    name: "GET /trade/reports/reconciliation",
    method: "reconciliation",
    path: () => "/api/v1/trade/reports/reconciliation",
    takesId: false,
  },
  {
    name: "GET /trade/reports/open-items/:itemId",
    method: "itemDetail",
    path: (id) => `/api/v1/trade/reports/open-items/${id}`,
    takesId: true,
  },
  {
    name: "GET /trade/open-items/:itemId/actions",
    method: "actions",
    path: (id) => `/api/v1/trade/open-items/${id}/actions`,
    takesId: true,
  },
  {
    name: "GET /trade/invoices/:documentId",
    method: "detail",
    path: (id) => `/api/v1/trade/invoices/${id}`,
    takesId: true,
  },
];
const idRoutes = routes.filter((route) => route.takesId);

const goodQuery = "company=DEFAULT";
const badQuery = "company=DEFAULT&extra=1";
const malformedId = "not-a-uuid";
const badIds = [
  malformedId,
  "-".repeat(36),
  // UUIDv1: right length and alphabet, wrong version.
  "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  randomUUID().toUpperCase(),
];
const validId = randomUUID();
const validIds = [validId, openingItemId("DEFAULT", "AP", "P01", "INV-1")];

/** Records which service methods were called; every call is answered with NOT_FOUND (404). */
function stubTradeDocs() {
  const calls: { method: StubMethod; args: unknown[] }[] = [];
  const answer =
    (method: StubMethod) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      throw new DomainError("NOT_FOUND");
    };
  const service = {
    report: answer("report"),
    reconciliation: answer("reconciliation"),
    itemDetail: answer("itemDetail"),
    actions: answer("actions"),
    detail: answer("detail"),
  } as unknown as TradeDocs;
  return { service, calls };
}

async function startApi(tradeDocs?: TradeDocs) {
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    webRoot: join(tmpdir(), `erp-missing-web-${randomUUID()}`),
    logError: () => undefined,
    ...(tradeDocs ? { tradeDocs } : {}),
  });
  onTestFinished(() => api.close());
  const host = new URL(await api.listen()).host;
  const send = (url: string, method: "GET" | "POST" = "GET", requestHost = host) =>
    api.server.inject({ method, url, headers: { host: requestHost } });
  return { send };
}

function url(route: Route, query: string, id = validId) {
  return `${route.path(id)}?${query}`;
}

function expectError(
  response: { statusCode: number; body: string; json: () => unknown },
  status: number,
) {
  expect(response.statusCode, response.body).toBe(status);
  return response.json() as { code: string; fieldErrors: { path: string; messageKey: string }[] };
}

describe("trade document routes check origin/method, then service, then request", () => {
  describe.each(routes)("$name", (route) => {
    const badRequest = route.takesId ? url(route, badQuery, malformedId) : url(route, badQuery);

    it("returns 403 for a foreign host before 503 and 400", async () => {
      const api = await startApi();
      expectError(await api.send(badRequest, "GET", "evil.example"), 403);
    });

    it("returns 405 with Allow: GET for another method before 503 and 400", async () => {
      const api = await startApi();
      const response = await api.send(badRequest, "POST");
      expectError(response, 405);
      expect(response.headers.allow).toBe("GET");
    });

    it("returns 503 without a service even for a bad query", async () => {
      const api = await startApi();
      expect(expectError(await api.send(url(route, badQuery)), 503).code).toBe("UNAVAILABLE");
    });

    it("returns 400 for a bad query with a service, without calling it", async () => {
      const stub = stubTradeDocs();
      const api = await startApi(stub.service);
      expectError(await api.send(url(route, badQuery)), 400);
      expect(stub.calls).toEqual([]);
    });
  });

  describe.each(idRoutes)("$name path id", (route) => {
    it("returns 503 without a service even for a bad id", async () => {
      const api = await startApi();
      expect(expectError(await api.send(url(route, goodQuery, malformedId)), 503).code).toBe(
        "UNAVAILABLE",
      );
    });

    it.each(badIds)("returns 400 like orderId for %s, without calling the service", async (id) => {
      const stub = stubTradeDocs();
      const api = await startApi(stub.service);
      const body = expectError(await api.send(url(route, goodQuery, id)), 400);
      expect(body.fieldErrors).toEqual([
        { path: "form", messageKey: "api.error.tradeDocument.shape" },
      ]);
      expect(stub.calls).toEqual([]);
    });

    it.each(validIds)("passes the valid id %s to the service", async (id) => {
      const stub = stubTradeDocs();
      const api = await startApi(stub.service);
      expectError(await api.send(url(route, goodQuery, id)), 404);
      expect(stub.calls).toEqual([{ method: route.method, args: expect.arrayContaining([id]) }]);
    });
  });
});
