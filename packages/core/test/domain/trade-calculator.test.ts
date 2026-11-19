import { expect, it } from "vitest";
import {
  calculateTrade,
  roundTradeRatio,
  type TradeCalculationInput,
  type TradeCalculationLine,
  type TradeTax,
} from "../../src/domain/index.ts";

const tax: TradeTax = {
  code: "VAT",
  treatment: "standard",
  ratePercent: "12",
  deductiblePercent: "50",
};
const row = (changes: Partial<TradeCalculationLine> = {}): TradeCalculationLine => ({
  id: "L1",
  quantity: "1",
  unitPrice: "73.19",
  discountPercent: "0",
  taxableCharges: "0.00",
  tax,
  ...changes,
});
const document = (changes: Partial<TradeCalculationInput> = {}): TradeCalculationInput => ({
  side: "ap",
  currency: "USD",
  accountingCurrency: "USD",
  scale: 2,
  priceMode: "exclusive",
  rounding: "line",
  lines: [row()],
  ...changes,
});
const amounts = (line: ReturnType<typeof calculateTrade>) => [
  line.net,
  line.tax,
  line.gross,
  line.deductibleTax,
  line.nonDeductibleTax,
  line.expense,
  line.cashDiscountBase,
];

it.each([
  {
    side: "ap",
    priceMode: "exclusive",
    price: "73.19",
    expected: [7319, 878, 8197, 439, 439, 7758, 7319],
  },
  {
    side: "ap",
    priceMode: "inclusive",
    price: "81.97",
    expected: [7319, 878, 8197, 439, 439, 7758, 7319],
  },
  {
    side: "ar",
    priceMode: "exclusive",
    price: "73.19",
    expected: [7319, 878, 8197, 0, 0, 0, 7319],
  },
  {
    side: "ar",
    priceMode: "inclusive",
    price: "81.97",
    expected: [7319, 878, 8197, 0, 0, 0, 7319],
  },
] as const)(
  "TC-T02: $side $priceMode base, tax, cost and cash-discount base",
  ({ side, priceMode, price, expected }) => {
    const result = calculateTrade(
      document({ side, priceMode, lines: [row({ unitPrice: price })] }),
    );
    expect(amounts(result)).toEqual(expected);
    expect(result.lines[0]).toMatchObject({
      net: result.net,
      tax: result.tax,
      gross: result.gross,
      cashDiscountBase: result.net,
    });
  },
);

it.each([
  {
    scale: 0,
    quantity: "1",
    price: "7",
    discount: "0",
    charge: "0",
    mode: "exclusive",
    expected: [7, 1, 8],
  },
  {
    scale: 2,
    quantity: "1.500000",
    price: "10.123456",
    discount: "10",
    charge: "1.00",
    mode: "exclusive",
    expected: [1467, 176, 1643],
  },
  {
    scale: 2,
    quantity: "1",
    price: "80.97",
    discount: "0",
    charge: "1.00",
    mode: "inclusive",
    expected: [7319, 878, 8197],
  },
  {
    scale: 4,
    quantity: "1",
    price: "1.0001",
    discount: "0",
    charge: "0.0000",
    mode: "exclusive",
    expected: [10001, 1200, 11201],
  },
  {
    scale: 2,
    quantity: "0.000001",
    price: "5000.000000",
    discount: "0",
    charge: "0",
    mode: "exclusive",
    expected: [1, 0, 1],
  },
  {
    scale: 2,
    quantity: "1.000001",
    price: "999999.999999",
    discount: "0.000001",
    charge: "0",
    mode: "exclusive",
    expected: [100000099, 12000012, 112000111],
  },
  {
    scale: 2,
    quantity: "1",
    price: "100",
    discount: "100",
    charge: "1",
    mode: "exclusive",
    expected: [100, 12, 112],
  },
] as const)(
  "exact quantity/price, commercial discount and charges at scale $scale: $price",
  ({ scale, quantity, price, discount, charge, mode, expected }) => {
    const result = calculateTrade(
      document({
        scale,
        priceMode: mode,
        lines: [
          row({ quantity, unitPrice: price, discountPercent: discount, taxableCharges: charge }),
        ],
      }),
    );
    expect([result.net, result.tax, result.gross]).toEqual(expected);
  },
);

it.each(["zero", "exempt"] as const)(
  "requires explicit $0 treatment and zero rate",
  (treatment) => {
    const result = calculateTrade(
      document({
        lines: [row({ tax: { ...tax, treatment, ratePercent: "0", deductiblePercent: "0" } })],
      }),
    );
    expect(amounts(result)).toEqual([7319, 0, 7319, 0, 0, 7319, 7319]);
    expect(result.lines[0].treatment).toBe(treatment);
    expect(() =>
      calculateTrade(document({ lines: [row({ tax: { ...tax, treatment } })] })),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  },
);

it.each([
  {
    priceMode: "exclusive",
    rounding: "line",
    expected: [
      [3, 0, 3],
      [3, 0, 3],
      [3, 0, 3],
    ],
  },
  {
    priceMode: "inclusive",
    rounding: "line",
    expected: [
      [3, 0, 3],
      [3, 0, 3],
      [3, 0, 3],
    ],
  },
  {
    priceMode: "exclusive",
    rounding: "document",
    expected: [
      [3, 1, 4],
      [3, 0, 3],
      [3, 0, 3],
    ],
  },
  {
    priceMode: "inclusive",
    rounding: "document",
    expected: [
      [2, 1, 3],
      [3, 0, 3],
      [3, 0, 3],
    ],
  },
] as const)(
  "TC-T03: $priceMode/$rounding keeps stable remainder source and per-line deduction",
  ({ priceMode, rounding, expected }) => {
    const input = document({
      priceMode,
      rounding,
      lines: ["L1", "L2", "L3"].map((id) => row({ id, unitPrice: "0.03" })),
    });
    const result = calculateTrade(input);
    expect(result.lines.map((line) => [line.net, line.tax, line.gross])).toEqual(expected);
    expect(result.lines.map((line) => line.deductibleTax)).toEqual(
      rounding === "line" ? [0, 0, 0] : [1, 0, 0],
    );
    expect(result.nonDeductibleTax).toBe(0);
    expect(result.lines.map((line) => line.roundingSource.adjustment)).toEqual(
      rounding === "line" ? [0, 0, 0] : [1, 0, 0],
    );
    expect(result.lines[0].roundingSource).toMatchObject({
      lineIndex: 0,
      lineRoundedTax: 0,
      exactTaxNumerator: "36000000",
      exactTaxDenominator: priceMode === "inclusive" ? "112000000" : "100000000",
    });
    expect(calculateTrade(input)).toEqual(result);
    const reordered = calculateTrade({
      ...input,
      lines: [input.lines[2], input.lines[0], input.lines[1]],
    });
    expect(reordered.lines[0].id).toBe("L3");
    expect(reordered.lines.map((line) => line.tax)).toEqual(result.lines.map((line) => line.tax));
  },
);

it("allocates nonuniform remainders by magnitude, not identity/order, and explains negative adjustments", () => {
  const lines = [
    row({ id: "small", unitPrice: "0.01" }),
    row({ id: "large", unitPrice: "0.04" }),
    row({ id: "middle", unitPrice: "0.03" }),
  ];
  const result = calculateTrade(document({ rounding: "document", lines }));
  expect(result.lines.map((line) => line.tax)).toEqual([0, 1, 0]);
  const reordered = calculateTrade(document({ rounding: "document", lines: [...lines].reverse() }));
  expect(reordered.lines.find((line) => line.id === "large")?.tax).toBe(1);
  const down = calculateTrade(
    document({
      rounding: "document",
      lines: ["A", "B", "C"].map((id) => row({ id, unitPrice: "0.05" })),
    }),
  );
  expect(down.lines.map((line) => line.tax)).toEqual([1, 1, 0]);
  expect(down.lines.map((line) => line.roundingSource.adjustment)).toEqual([0, 0, -1]);
});

it("never pools distinct tax codes or tax treatments; normalizes equivalent rate precision", () => {
  const scenarios = [
    { ...tax, code: "OTHER" },
    { ...tax, ratePercent: "13" },
    { ...tax, deductiblePercent: "0" },
  ];
  for (const otherTax of scenarios) {
    const result = calculateTrade(
      document({
        rounding: "document",
        lines: [row({ unitPrice: "0.03" }), row({ id: "L2", unitPrice: "0.03", tax: otherTax })],
      }),
    );
    expect(result.lines.map((line) => line.tax)).toEqual([0, 0]);
  }
  const normalized = calculateTrade(
    document({
      rounding: "document",
      lines: [
        row({ unitPrice: "0.03" }),
        row({
          id: "L2",
          unitPrice: "0.03",
          tax: { ...tax, ratePercent: "12.000000", deductiblePercent: "50.0" },
        }),
      ],
    }),
  );
  expect(normalized.lines.map((line) => line.tax)).toEqual([1, 0]);
  const zeroModes = calculateTrade(
    document({
      rounding: "document",
      lines: [
        row({ tax: { ...tax, treatment: "zero", ratePercent: "0" } }),
        row({ id: "L2", tax: { ...tax, treatment: "exempt", ratePercent: "0" } }),
      ],
    }),
  );
  expect(zeroModes.lines[0].roundingSource.group).not.toEqual(
    zeroModes.lines[1].roundingSource.group,
  );
});

it.each([
  { rounding: "line", expected: [2, 1, 3] },
  { rounding: "document", expected: [1, 2, 3] },
] as const)(
  "inclusive half tie follows $rounding algorithm without changing gross",
  ({ rounding, expected }) => {
    const result = calculateTrade(
      document({
        priceMode: "inclusive",
        rounding,
        lines: [row({ unitPrice: "0.03", tax: { ...tax, ratePercent: "100" } })],
      }),
    );
    expect([result.net, result.tax, result.gross]).toEqual(expected);
  },
);

it.each(["0", "33.333333", "100"])(
  "allocates purchase deduction $0 only after final line tax",
  (deductiblePercent) => {
    const result = calculateTrade(
      document({
        rounding: "document",
        lines: [row({ tax: { ...tax, deductiblePercent } })],
      }),
    );
    const deductible = deductiblePercent === "0" ? 0 : deductiblePercent === "100" ? 878 : 293;
    expect(result.deductibleTax).toBe(deductible);
    expect(result.nonDeductibleTax).toBe(878 - deductible);
    expect(result.expense + result.deductibleTax).toBe(result.gross);
  },
);

it("rejects malformed, client-calculated, foreign-currency and unsupported inputs explicitly", () => {
  const badLines = [
    { quantity: "0" },
    { quantity: "-1" },
    { unitPrice: "-1" },
    { unitPrice: 1.5 },
    { unitPrice: "1.0000001" },
    { quantity: "1.0000001" },
    { unitPrice: "1e2" },
    { unitPrice: " 1" },
    { unitPrice: "+1" },
    { quantity: "NaN" },
    { taxableCharges: "0.001" },
    { taxableCharges: "-0.01" },
    { discountPercent: "100.000001" },
    { discountPercent: "-1" },
    { id: "" },
    { tax: undefined },
    { tax: null },
    { tax: {} },
    { tax: { ...tax, code: "" } },
    { tax: { ...tax, treatment: "self-assessed" } },
    { tax: { ...tax, ratePercent: "100.1" } },
    { tax: { ...tax, deductiblePercent: "-1" } },
    { tax: { ...tax, ratePercent: 12 } },
    { tax: { ...tax, deductiblePercent: "100.1" } },
    { taxAmount: 0 },
    { tax: { ...tax, amount: 0 } },
    { kind: "inventory" },
  ];
  const badDocuments = [
    { currency: "EUR" },
    { currency: "usd", accountingCurrency: "usd" },
    { scale: -1 },
    { scale: 5 },
    { scale: 1.5 },
    { side: "other" },
    { priceMode: "other" },
    { rounding: "other" },
    { lines: [] },
    { lines: null },
    { lines: Object.assign(new Array(2), { 0: row() }) },
    { lines: [row(), row()] },
    { lines: Array.from({ length: 101 }, (_, index) => row({ id: `${index}` })) },
    { tax: 878 },
    { taxAmount: 878 },
    { lines: [row({ unitPrice: "0.001" })] },
  ];
  for (const input of [
    ...badLines.map((changes) => ({ ...document(), lines: [{ ...row(), ...changes }] })),
    ...badDocuments.map((changes) => ({ ...document(), ...changes })),
    null,
    {},
  ]) {
    expect(() => calculateTrade(input as TradeCalculationInput)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  }
  expect(() => calculateTrade(document({ lines: [row({ unitPrice: "-1" })] }))).toThrow(
    expect.objectContaining({
      issue: { scope: "trade-calculator", path: "lines.0.unitPrice", rule: "decimal" },
    }),
  );
});

it("allows exact safe-integer boundary but rejects line and accumulated document overflow", () => {
  const untaxed = { ...tax, treatment: "zero" as const, ratePercent: "0" };
  expect(
    calculateTrade(
      document({
        lines: [row({ unitPrice: "90071992547409.91", tax: untaxed })],
      }),
    ).gross,
  ).toBe(Number.MAX_SAFE_INTEGER);
  for (const lines of [
    [row({ unitPrice: "90071992547409.91" })],
    [row({ unitPrice: "90071992547409.92", tax: untaxed })],
    [
      row({ unitPrice: "45035996273704.96", tax: untaxed }),
      row({ id: "L2", unitPrice: "45035996273704.96", tax: untaxed }),
    ],
  ]) {
    expect(() => calculateTrade(document({ lines }))).toThrow(
      expect.objectContaining({ code: "OVERFLOW" }),
    );
  }
});

it("uses symmetric exact half-up for settlement/discount ratios and rejects invalid ratios", () => {
  for (const [numerator, denominator, expected] of [
    [7319n * 4099n, 8197n, 3660],
    [3660n * 15n, 1000n, 55],
    [7319n * 15n, 1000n, 110],
    [-5n, 2n, -3],
    [5n, 2n, 3],
    [-4n, 3n, -1],
  ] as const) {
    expect(roundTradeRatio(numerator, denominator)).toBe(expected);
  }
  expect(() => roundTradeRatio(1n, 0n)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  expect(() => roundTradeRatio(1n, -1n)).toThrow(
    expect.objectContaining({ code: "INVALID_INPUT" }),
  );
  expect(() => roundTradeRatio(9007199254740992n, 1n)).toThrow(
    expect.objectContaining({ code: "OVERFLOW" }),
  );
});

it("does not mutate inputs and deterministically calculates a 100-line document", () => {
  const input = Object.freeze(
    document({
      rounding: "document",
      lines: Object.freeze(
        Array.from({ length: 100 }, (_, index) =>
          Object.freeze(row({ id: `${index}`, tax: Object.freeze({ ...tax }) })),
        ),
      ),
    }),
  );
  for (let i = 0; i < 15; i++) {
    const result = calculateTrade(input);
    expect(result.gross).toBe(819728);
    expect(result.net + result.tax).toBe(result.gross);
    expect(result.expense + result.deductibleTax).toBe(result.gross);
    expect(result.lines.every((line) => line.net + line.tax === line.gross)).toBe(true);
  }
});
