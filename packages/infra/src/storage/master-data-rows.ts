import { StorageError } from "@erp/core/application";
import type { Account, Company, Page, PageQuery, Period } from "@erp/core/domain";
import {
  accountSchema,
  companySchema,
  periodSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import type { Row } from "./types.ts";

function decode<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
const numeric = (value: unknown) => (typeof value === "bigint" ? Number(value) : value);
function companyRow(row: Row): Company {
  return decode(companySchema, {
    code: row.company_id,
    name: row.name,
    currency: row.currency,
    scale: numeric(row.scale),
    year: numeric(row.year),
    closeMode: row.close_mode,
    revision: numeric(row.revision),
  });
}
function flag(value: unknown): boolean {
  if (value !== 0n && value !== 1n && value !== 0 && value !== 1)
    throw new StorageError("STORAGE_FAILURE");
  return value === 1n || value === 1;
}
function accountRow(row: Row): Account {
  return decode(accountSchema, {
    code: row.code,
    name: row.name,
    category: row.category,
    reportGroup: row.report_group,
    normalSide: row.normal_side,
    purpose: row.purpose,
    controlModule: row.control_module,
    contraOf: row.contra_of,
    manualAllowed: flag(row.manual_allowed),
    active: flag(row.active),
    builtin: flag(row.builtin),
    revision: numeric(row.revision),
  });
}
function periodRow(row: Row): Period {
  return decode(periodSchema, {
    month: row.month,
    status: row.status,
    revision: numeric(row.revision),
    modules: JSON.parse(String(row.modules)),
  });
}
function page<T>(
  rows: readonly Row[],
  query: PageQuery,
  parse: (row: Row) => T,
  key: (item: T) => string,
): Page<T> {
  const items = rows.slice(0, query.limit).map(parse);
  return { items, nextCursor: rows.length > query.limit ? key(items[items.length - 1]) : null };
}

export { accountRow, companyRow, decode, page, periodRow };
