export function validateDevOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/u.exec(value);
  if (
    !match ||
    Number(match[1]) > 65535 ||
    Number(match[1]) === 4173 ||
    new URL(value).origin !== value
  ) {
    throw new TypeError("Invalid Local development origin");
  }
  return value;
}
