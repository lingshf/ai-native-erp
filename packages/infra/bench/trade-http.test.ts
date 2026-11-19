import { describe, expect, it } from "vitest";
import { healthSchema } from "@erp/core/contracts";
import { measureTradeResponse, summarizeTradeSamples } from "./trade-http.ts";

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
