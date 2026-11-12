export function formatMinor(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Expected safe integer minor units.');
  const value = BigInt(cents), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${(absolute / 100n).toLocaleString('zh-CN')}.${String(absolute % 100n).padStart(2, '0')}`;
}
