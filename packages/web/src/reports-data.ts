import {
  errorSchema,
  legacyContextSchema,
  legacyLedgerSchema,
  legacyTrialSchema,
  type ErrorResponse,
  type LegacyContextResponse,
  type LegacyLedgerResponse,
  type LegacySnapshotInfo,
  type LegacyTrialResponse,
} from "@erp/core/contracts";
import type { Language } from "./ui/index.ts";

export class ReportFailure extends Error {
  readonly kind: "network" | "invalid" | "http";
  readonly detail?: ErrorResponse;
  readonly status?: number;
  constructor(kind: "network" | "invalid" | "http", detail?: ErrorResponse, status?: number) {
    super(kind);
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}
const invalid = (): never => {
  throw new ReportFailure("invalid");
};
export interface ReportScope {
  readonly source: LegacySnapshotInfo;
  readonly month: string;
}
function sameSource(actual: LegacySnapshotInfo, expected: LegacySnapshotInfo) {
  return (
    actual.sourceKind === expected.sourceKind &&
    actual.baseline === expected.baseline &&
    actual.live === expected.live &&
    actual.snapshotSha256 === expected.snapshotSha256 &&
    actual.snapshotBytes === expected.snapshotBytes &&
    actual.scale === expected.scale
  );
}
export function parseContext(body: unknown): LegacyContextResponse {
  const parsed = legacyContextSchema.safeParse(body);
  if (!parsed.success) return invalid();
  const { periods } = parsed.data;
  if (periods.some((period, index) => index > 0 && periods[index - 1]!.month >= period.month))
    return invalid();
  return parsed.data;
}
export function parseTrial(body: unknown, scope: ReportScope): LegacyTrialResponse {
  const parsed = legacyTrialSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.month !== scope.month ||
    !sameSource(parsed.data.source, scope.source)
  )
    return invalid();
  return parsed.data;
}
export function parseLedgerPage(
  body: unknown,
  scope: ReportScope & { readonly account: string },
  previous: readonly LegacyLedgerResponse[],
  requestedCursor: string | undefined,
): LegacyLedgerResponse {
  const parsed = legacyLedgerSchema.safeParse(body);
  if (!parsed.success) return invalid();
  const page = parsed.data;
  if (
    !sameSource(page.source, scope.source) ||
    page.month !== scope.month ||
    page.account !== scope.account
  )
    return invalid();
  if (requestedCursor !== previous.at(-1)?.nextCursor) return invalid();
  const first = previous[0];
  if (
    first &&
    (["opening", "closing", "debit", "credit", "totalEntries"] as const).some(
      (field) => first[field] !== page[field],
    )
  )
    return invalid();
  const lines = new Set<number>();
  const cursors = new Set<string>();
  for (const prior of previous) {
    for (const entry of prior.entries) lines.add(entry.lineId);
    if (prior.nextCursor) cursors.add(prior.nextCursor);
  }
  if (page.nextCursor && (cursors.has(page.nextCursor) || page.entries.length === 0))
    return invalid();
  for (const entry of page.entries) {
    if (
      lines.has(entry.lineId) ||
      entry.account !== scope.account ||
      !entry.date.startsWith(`${scope.month}-`)
    )
      return invalid();
    lines.add(entry.lineId);
  }
  if (
    lines.size > page.totalEntries ||
    (!page.nextCursor && lines.size !== page.totalEntries) ||
    (page.nextCursor && lines.size >= page.totalEntries)
  )
    return invalid();
  return page;
}
// A safe integer has at most 16 digits, so 15 decimals is the most that still leaves one integer
// digit. Money (company scale ≤ 4) and statistics quantities (scale 6) share this one bound.
const MAX_MINOR_SCALE = String(Number.MAX_SAFE_INTEGER).length - 1;
export function formatMinor(value: number, language: Language, scale = 2): string {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > MAX_MINOR_SCALE
  )
    return invalid();
  const integer = BigInt(value);
  const magnitude = integer < 0n ? -integer : integer;
  const whole = new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(
    magnitude / 10n ** BigInt(scale),
  );
  return `${integer < 0n ? "-" : ""}${whole}${scale ? `.${String(magnitude % 10n ** BigInt(scale)).padStart(scale, "0")}` : ""}`;
}
export async function readReport<T>(
  path: string,
  signal: AbortSignal,
  parse: (body: unknown) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch {
    throw new ReportFailure("network");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalid();
  }
  // A transport that ignores abort must not commit a decoded result after a context change.
  signal.throwIfAborted();
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    if (!error.success) return invalid();
    throw new ReportFailure("http", error.data, response.status);
  }
  return parse(body);
}
