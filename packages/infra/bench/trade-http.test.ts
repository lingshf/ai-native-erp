import { describe, expect, it } from "vitest";
import { healthSchema } from "@erp/core/contracts";
import { measureTradeResponse, summarizeTradeSamples } from "./trade-http.ts";
import { balancesAt, tradeHistoryRole, tradeSettlementDates } from "./trade-history.ts";

describe("trade history plan", () => {
  it("averages two settlements per invoice item and adjusts exactly 5% of items", () => {
    const plans = Array.from({ length: 100_000 }, (_, index) => tradeHistoryRole(index));
    expect(plans.reduce((n, plan) => n + plan.settlements, 0)).toBe(200_000);
    expect(plans.filter((plan) => plan.role === "cancel")).toHaveLength(2_500);
    expect(plans.filter((plan) => plan.role === "advance")).toHaveLength(2_500);
    expect(plans.filter((plan) => plan.settlements === 4)).toHaveLength(20_000);
  });
  it("dates settlements at successive month ends, clamped to the open window", () => {
    expect(tradeSettlementDates("2026-01-31", 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(tradeSettlementDates("2026-11-03", 3)).toEqual([
      "2026-11-30",
      "2026-12-31",
      "2026-12-31",
    ]);
  });
  it("derives expected balances from dated events, by cutoff and party", () => {
    const deltas = [
      { kind: "invoice" as const, party: "P0001", date: "2026-01-05", gross: 11_300 },
      { kind: "invoice" as const, party: "P0001", date: "2026-06-30", gross: -2_000 },
      { kind: "invoice" as const, party: "P0001", date: "2026-07-31", gross: -9_300 },
      { kind: "advance" as const, party: "P0002", date: "2026-02-01", gross: 6_000 },
    ];
    expect(balancesAt(deltas, "2026-06-30")).toEqual({
      invoiceGrossMinor: 9_300,
      advanceGrossMinor: 6_000,
    });
    expect(balancesAt(deltas, "2026-12-31", "P0001")).toEqual({
      invoiceGrossMinor: 0,
      advanceGrossMinor: 0,
    });
  });
});

describe("trade benchmark evidence", () => {
  it("stops timing only after the full response and shared contract have been parsed", async () => {
    let time = 0;
    const body = JSON.stringify({
      service: "ai-native-erp",
      contractVersion: "1",
      profile: "local",
      data: "configured",
    });
    const result = await measureTradeResponse(
      async () => {
        time += 7;
        return body;
      },
      {
        parse(value) {
          time += 13;
          return healthSchema.parse(value);
        },
      },
      () => time,
    );
    expect(result).toEqual({ value: JSON.parse(body), ms: 20, bytes: Buffer.byteLength(body) });
  });
  it("uses nearest-rank percentiles without sorting away raw sample order", () => {
    const raw = Array.from({ length: 24 }, (_, index) => 24 - index);
    const result = summarizeTradeSamples(raw, 23);
    expect(result.rawMs).toEqual(raw);
    expect(result).toMatchObject({ p50Ms: 12, p95Ms: 23, p99Ms: 24, pass: true, d18: true });
    expect(raw[0]).toBe(24);
  });
  it("keeps the hard budget and the D18 warning distinct at their boundaries", () => {
    expect(summarizeTradeSamples(Array(24).fill(800), 1_000)).toMatchObject({
      pass: true,
      d18: false,
    });
    expect(summarizeTradeSamples(Array(24).fill(801), 1_000)).toMatchObject({
      pass: true,
      d18: true,
    });
    expect(summarizeTradeSamples(Array(24).fill(1_001), 1_000).pass).toBe(false);
  });
  it("rejects incomplete or invalid evidence", () => {
    expect(() => summarizeTradeSamples(Array(23).fill(1), 1_000)).toThrow();
    expect(() => summarizeTradeSamples([...Array(23).fill(1), Number.NaN], 1_000)).toThrow();
    expect(() => summarizeTradeSamples(Array(24).fill(-1), 1_000)).toThrow();
    expect(() => summarizeTradeSamples(Array(24).fill(1), 0)).toThrow();
  });
});
