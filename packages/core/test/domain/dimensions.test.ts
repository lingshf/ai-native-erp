import { describe, expect, it } from "vitest";
import {
  compileDimensionRules,
  dimensionBalance,
  validateDimensionConfig,
  type DimensionConfig,
} from "../../src/domain/index.ts";
const base = { revision: 1, active: true, from: "2026-01-01", to: "2026-12-31" };
const catalog: DimensionConfig[] = ["DEPT", "COST", "SITE"].flatMap((code) => [
  { ...base, kind: "dimension" as const, code, name: code },
  ...["A", "B"].map((value) => ({
    ...base,
    kind: "value" as const,
    dimension: code,
    code: value,
    name: value,
  })),
]);
const structure: Extract<DimensionConfig, { kind: "structure" }> = {
  ...base,
  kind: "structure",
  code: "1000",
  required: [],
  optional: [],
  forbidden: [],
  allowed: [],
  fixed: {},
  conditionals: [],
};
describe("dimension rules", () => {
  it("orders ledger/account/master/header/line, preserves explicit null in fill and evaluates dependencies independently of IDs", () => {
    const configs: DimensionConfig[] = [
      ...catalog,
      { ...base, kind: "defaults", code: "LEDGER", values: { DEPT: "A", COST: "A" } },
      { ...base, kind: "defaults", code: "1000", values: { DEPT: "B" } },
      {
        ...base,
        kind: "derivation",
        code: "Z",
        when: { DEPT: "A" },
        values: { COST: "B" },
        mode: "replace",
      },
      {
        ...base,
        kind: "derivation",
        code: "A",
        when: { COST: "B" },
        values: { SITE: "B" },
        mode: "fill",
      },
    ];
    const resolver = compileDimensionRules(configs);
    const result = resolver.resolve({
      account: "1000",
      day: "2026-01-15",
      master: { DEPT: "B" },
      header: { DEPT: "A" },
      explicit: { SITE: null },
    });
    expect(result.dimensions).toEqual({ DEPT: "A", COST: "B", SITE: null });
    expect(result.dimensionOrigins.DEPT.map((item) => item.source)).toEqual([
      "defaults:LEDGER@1",
      "defaults:1000@1",
      "master",
      "header",
    ]);
    expect(result.dimensionOrigins.COST.at(-1)).toMatchObject({ previous: "A", value: "B" });
    expect(
      resolver.resolve({ account: "1000", day: "2026-01-15", explicit: { DEPT: "A" } }).dimensions
        .SITE,
    ).toBe("B");
  });
  it("uses subset allowed combinations (D5), independently checks required/forbidden and stabilizes conditional fixed constraints", () => {
    const rule = {
      ...structure,
      required: ["DEPT"],
      optional: ["COST"],
      forbidden: ["SITE"],
      allowed: [{ DEPT: "A" }],
    };
    const resolver = compileDimensionRules([...catalog, rule]);
    for (const explicit of [{ DEPT: "A" }, { DEPT: "A", COST: "B" }])
      expect(resolver.resolve({ account: "1000", day: "2026-01-15", explicit }).dimensions).toEqual(
        explicit,
      );
    const wildcard = { ...rule, allowed: [{}] };
    validateDimensionConfig(wildcard, [...catalog, wildcard]);
    expect(
      compileDimensionRules([...catalog, wildcard]).resolve({
        account: "1000",
        day: "2026-01-15",
        explicit: { DEPT: "B", COST: "A" },
      }).dimensions,
    ).toEqual({ DEPT: "B", COST: "A" });
    for (const [explicit, path, rule] of [
      [{ COST: "A" }, "dimensions.DEPT", "required"],
      [{ DEPT: "A", SITE: null }, "dimensions.SITE", "forbidden"],
      [{ DEPT: "B" }, "dimensions", "combination"],
    ] as const)
      expect(() => resolver.resolve({ account: "1000", day: "2026-01-15", explicit })).toThrow(
        expect.objectContaining({ issue: expect.objectContaining({ path, rule }) }),
      );
    const fixed = compileDimensionRules([
      ...catalog,
      {
        ...structure,
        fixed: { DEPT: "B" },
        conditionals: [
          { when: { DEPT: "B" }, required: ["COST"], fixed: { COST: "A" } },
          { when: {}, required: [], fixed: { COST: "A" } },
        ],
      },
    ]);
    expect(fixed.resolve({ account: "1000", day: "2026-01-15" }).dimensions).toEqual({
      DEPT: "B",
      COST: "A",
    });
    expect(() =>
      fixed.resolve({ account: "1000", day: "2026-01-15", explicit: { COST: "B" } }),
    ).toThrow(expect.objectContaining({ issue: expect.objectContaining({ rule: "conflict" }) }));
    const cyclic = compileDimensionRules([
      ...catalog,
      {
        ...structure,
        conditionals: [
          { when: { DEPT: "A" }, required: [], fixed: { DEPT: "B" } },
          { when: { DEPT: "B" }, required: [], fixed: { DEPT: "A" } },
        ],
      },
    ]);
    expect(() =>
      cyclic.resolve({ account: "1000", day: "2026-01-15", explicit: { DEPT: "A" } }),
    ).toThrow(expect.objectContaining({ issue: expect.objectContaining({ rule: "cycle" }) }));
  });
  it("reports configuration paths for missing references, duplicate constraints, bad windows and dependency cycles", () => {
    const cases: readonly [DimensionConfig, string, string][] = [
      [{ ...structure, required: ["MISSING"] }, "required.0", "reference"],
      [{ ...structure, required: ["DEPT"], forbidden: ["DEPT"] }, "forbidden", "duplicate"],
      [{ ...structure, from: "2026-02-01", to: "2026-01-01" }, "to", "window"],
      [{ ...structure, from: "2026-02-30" }, "from", "window"],
      [
        {
          ...structure,
          allowed: [
            { DEPT: "A", COST: "A" },
            { COST: "A", DEPT: "A" },
          ],
        },
        "allowed.1",
        "duplicate",
      ],
      [
        {
          ...base,
          kind: "derivation",
          code: "LOOP",
          when: { DEPT: "A" },
          values: { DEPT: "B" },
          mode: "replace",
        },
        "when",
        "cycle",
      ],
    ];
    for (const [config, path, rule] of cases)
      expect(() => validateDimensionConfig(config, [...catalog, config])).toThrow(
        expect.objectContaining({
          code: "INVALID_INPUT",
          issue: { scope: "dimensions", path, rule },
        }),
      );
    const dependent: DimensionConfig[] = [
      ...catalog,
      {
        ...base,
        kind: "derivation",
        code: "FIRST",
        when: { DEPT: "A" },
        values: { COST: "A" },
        mode: "replace",
      },
    ];
    expect(() =>
      validateDimensionConfig(
        {
          ...base,
          kind: "derivation",
          code: "BACK",
          when: { COST: "A" },
          values: { DEPT: "A" },
          mode: "replace",
        },
        dependent,
      ),
    ).toThrow();
    const conflicting = compileDimensionRules([
      ...dependent,
      {
        ...base,
        kind: "derivation",
        code: "SECOND",
        when: { DEPT: "A" },
        values: { COST: "B" },
        mode: "replace",
      },
    ]);
    expect(() =>
      conflicting.resolve({ account: "1000", day: "2026-01-15", explicit: { DEPT: "A" } }),
    ).toThrow(expect.objectContaining({ issue: expect.objectContaining({ rule: "conflict" }) }));
  });
  it("honors inclusive value windows and deactivation without treating explicit null as a missing key", () => {
    const bounded = catalog.map((item) =>
      item.kind === "value" && item.dimension === "DEPT" && item.code === "A"
        ? { ...item, from: "2026-01-15", to: "2026-01-16" }
        : item,
    );
    const resolver = compileDimensionRules(bounded);
    for (const day of ["2026-01-15", "2026-01-16"])
      expect(
        resolver.resolve({ account: "1000", day, explicit: { DEPT: "A" } }).dimensions.DEPT,
      ).toBe("A");
    for (const day of ["2026-01-14", "2026-01-17"])
      expect(() => resolver.resolve({ account: "1000", day, explicit: { DEPT: "A" } })).toThrow();
    const inactive = compileDimensionRules(
      bounded.map((item) => (item.kind === "value" ? { ...item, active: false } : item)),
    );
    expect(() =>
      inactive.resolve({ account: "1000", day: "2026-01-15", explicit: { DEPT: "A" } }),
    ).toThrow();
    expect(
      inactive.resolve({ account: "1000", day: "2026-01-15", explicit: { DEPT: null } }).dimensions
        .DEPT,
    ).toBeNull();
  });
  it("requires pre-balanced business amounts and non-null balancing values, calculates deterministic exact internal offsets without mutating lines", () => {
    const config = {
      ...base,
      kind: "balance" as const,
      code: "LEDGER",
      dimension: "DEPT",
      account: "2800",
    };
    const lines = [
      { debit: 1300, credit: 0, dimensions: { DEPT: "A" } },
      { debit: 0, credit: 1300, dimensions: { DEPT: "B" } },
    ];
    const before = JSON.stringify(lines);
    expect(dimensionBalance(config, "2026-01-15", lines)).toMatchObject([
      { account: "2800", debit: 0, credit: 1300, dimensions: { DEPT: "A" }, businessNet: 1300 },
      { account: "2800", debit: 1300, credit: 0, dimensions: { DEPT: "B" }, businessNet: -1300 },
    ]);
    expect(JSON.stringify(lines)).toBe(before);
    expect(() =>
      dimensionBalance(config, "2026-01-15", [{ debit: 1, credit: 0, dimensions: {} }]),
    ).toThrow(
      expect.objectContaining({
        issue: expect.objectContaining({ path: "lines", rule: "balance" }),
      }),
    );
    for (const changed of [
      [{ ...lines[0], debit: 1299 }, lines[1]],
      [{ ...lines[0], dimensions: {} }, lines[1]],
      [{ ...lines[0], debit: Number.MAX_SAFE_INTEGER + 1 }, lines[1]],
    ])
      expect(() => dimensionBalance(config, "2026-01-15", changed)).toThrow();
  });
});
