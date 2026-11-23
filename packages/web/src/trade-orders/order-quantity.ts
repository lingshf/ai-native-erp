// Exact decimal arithmetic in millionths (the contract allows at most 6 fraction digits).
export const micros = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};
export const fromMicros = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = String(abs % 1_000_000n)
    .padStart(6, "0")
    .replace(/0+$/u, "");
  return `${sign}${abs / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
};
