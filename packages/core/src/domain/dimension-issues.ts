import { DomainError } from "./index.ts";
import type { DimensionFieldIssue } from "./dimensions.ts";

export function dimensionError(path: string, rule: DimensionFieldIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "dimensions", path, rule });
}
export function checkedDimensionDay(day: string, path = "day"): void {
  if (
    !/^(?:19\d{2}|[2-9]\d{3})-\d\d-\d\d$/u.test(day) ||
    day > "9998-12-31" ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    dimensionError(path, "window");
}
