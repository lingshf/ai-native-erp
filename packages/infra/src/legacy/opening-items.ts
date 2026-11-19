import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { StorageError } from "@erp/core/application";
import {
  DomainError,
  assertTradeAccount,
  checkedJournalDay,
  normalizeExternalInvoice,
  tradeSegments,
  validateTradeConfig,
  type Account,
  type DimensionMap,
  type OpenItem,
  type TradeAccountRole,
  type TradeConfig,
} from "@erp/core/domain";

/** Blocking rules 1-5 of M2-03b; `mapping` covers the mapping validation section. */
export type OpeningRule = "1" | "2" | "3" | "4" | "5" | "mapping" | "shape";
export interface OpeningIssue {
  readonly rule: OpeningRule;
  readonly company?: string;
  readonly account?: string;
  readonly path: string;
  readonly detail: string;
}
export interface OpeningAccount {
  readonly source: string;
  readonly company: string;
  readonly account: string;
  readonly side: "AP" | "AR";
  readonly cutover: string;
  readonly balanceMinor: string;
  readonly declaration: "detail" | "empty";
  readonly rows: number;
}
export interface OpeningEntry {
  readonly source: string;
  readonly company: string;
  readonly legacyId: string;
  readonly journalLegacyRef: string;
  readonly item: OpenItem;
  readonly evidence: string;
}
export interface OpeningPlan {
  readonly sha: string | null;
  readonly configs: readonly { readonly company: string; readonly config: TradeConfig }[];
  readonly accounts: readonly OpeningAccount[];
  readonly entries: readonly OpeningEntry[];
}

type Fields = Record<string, unknown>;
const record = (value: unknown): value is Fields =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const control = /\p{Cc}/u;

export function openingItemsSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
/** Deterministic UUIDv4-shaped identity so resumed imports write identical rows. */
export function openingItemId(company: string, side: string, party: string, externalNo: string) {
  const bytes = createHash("sha256")
    .update(JSON.stringify(["opening_items", company, side, party, externalNo]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function day(value: unknown): boolean {
  try {
    checkedJournalDay(value as string, "day");
    return true;
  } catch {
    return false;
  }
}
function minor(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?(?:0|[1-9]\d{0,15})$/u.test(value)) {
    const result = BigInt(value);
    return result >= -BigInt(Number.MAX_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER)
      ? result
      : null;
  }
  return null;
}
function dimensions(value: unknown): DimensionMap | null {
  if (value === undefined) return {};
  if (!record(value) || Object.keys(value).length > 32) return null;
  for (const item of Object.values(value)) if (typeof item !== "string") return null;
  return value as DimensionMap;
}
function account(target: Fields): Account {
  return {
    code: String(target.code),
    name: String(target.name),
    category: target.category as Account["category"],
    reportGroup: target.report_group as Account["reportGroup"],
    normalSide: target.normal_side as Account["normalSide"],
    purpose: target.purpose as Account["purpose"],
    controlModule: (target.control_module ?? null) as Account["controlModule"],
    contraOf: (target.contra_of ?? null) as string | null,
    manualAllowed: target.manual_allowed === true,
    active: target.active === true,
    builtin: false,
    revision: 1,
  } as Account;
}

/**
 * Validates the explicit opening-items file against the staged import plan (never the target).
 * The same function serves the library dry-run and the import; every blocking issue is listed.
 */
export function validateOpeningItems(
  plan: Database.Database,
  bytes: Uint8Array | undefined,
): { plan: OpeningPlan; issues: OpeningIssue[] } {
  const issues: OpeningIssue[] = [];
  const issue = (
    rule: OpeningRule,
    path: string,
    detail: string,
    scope: { company?: string; account?: string } = {},
  ) => issues.push({ rule, ...scope, path, detail });
  const parse = (value: string) => JSON.parse(value) as Fields;
  const companies = new Map<string, { currency: string; year: number; source: string }>();
  for (const row of plan
    .prepare("SELECT source,company,target FROM planned WHERE object='companies' ORDER BY company")
    .all() as { source: string; company: string; target: string }[]) {
    const target = parse(row.target);
    companies.set(row.company, {
      currency: String(target.currency),
      year: Number(target.year),
      source: row.source,
    });
  }
  const accounts = new Map<string, Account & { source: string }>();
  for (const row of plan
    .prepare("SELECT source,company,target FROM planned WHERE object='accounts'")
    .all() as { source: string; company: string; target: string }[])
    accounts.set(`${row.company}:${parse(row.target).code}`, {
      ...account(parse(row.target)),
      source: row.source,
    });
  const catalog = new Map<string, Set<string>>();
  for (const row of plan
    .prepare(
      "SELECT company,object,target FROM planned WHERE object IN('dimensions','dimension_values')",
    )
    .all() as { company: string; object: string; target: string }[]) {
    const target = parse(row.target);
    if (target.active !== true) continue;
    catalog
      .set(row.company, catalog.get(row.company) ?? new Set())
      .get(row.company)
      ?.add(
        row.object === "dimensions"
          ? `D:${target.code}`
          : `V:${target.dimension_code}:${target.value_code}`,
      );
  }
  const controls = [...accounts.entries()]
    .filter(
      ([, a]) => a.purpose === "control" && (a.controlModule === "AP" || a.controlModule === "AR"),
    )
    .map(([key, a]) => ({ key, company: key.slice(0, key.indexOf(":")), account: a }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const cutovers = new Map<string, string>();
  for (const [company, owner] of companies) {
    const row = plan
      .prepare(
        "SELECT max(date) AS day FROM planned WHERE object='journals' AND company=? AND json_extract(target,'$.status')='historical'",
      )
      .get(company) as { day: string | null };
    cutovers.set(company, row.day ?? `${String(owner.year).padStart(4, "0")}-12-31`);
  }
  // All historical journals are on or before the cutover by construction (cutover = their max date).
  const balances = new Map<string, bigint>();
  const historicalLines = `FROM planned l JOIN planned j ON j.source=l.source AND j.object='journals' AND j.legacy=l.parent AND j.company=l.company
    WHERE l.object='lines' AND json_extract(j.target,'$.status')='historical'`;
  for (const row of plan
    .prepare(
      `SELECT l.company,json_extract(l.target,'$.account_code') AS account,
      sum(CAST(json_extract(l.target,'$.debit_minor') AS INTEGER)-CAST(json_extract(l.target,'$.credit_minor') AS INTEGER)) AS balance
      ${historicalLines} GROUP BY 1,2`,
    )
    .safeIntegers(true)
    .all() as { company: string; account: string; balance: bigint }[])
    balances.set(`${row.company}:${row.account}`, BigInt(row.balance));
  const touches = plan.prepare(
    `SELECT 1 ${historicalLines} AND l.company=? AND l.parent=? AND json_extract(l.target,'$.account_code')=? LIMIT 1`,
  );
  const latest = plan.prepare(
    `SELECT j.legacy ${historicalLines} AND l.company=? AND json_extract(l.target,'$.account_code')=?
    ORDER BY j.date DESC,length(j.legacy) DESC,j.legacy DESC LIMIT 1`,
  );
  const empty: OpeningPlan = { sha: null, configs: [], accounts: [], entries: [] };
  if (!bytes) {
    if (controls.length) {
      issue(
        "1",
        "openingItems",
        "AP/AR control accounts are in scope; --opening-items is required",
      );
      for (const c of controls) {
        issue("1", "accounts", "missing detail/empty declaration", {
          company: c.company,
          account: c.account.code,
        });
        if ((balances.get(c.key) ?? 0n) !== 0n)
          issue("2", "accounts", `declared 0 but LEGACY GL balance is ${balances.get(c.key)}`, {
            company: c.company,
            account: c.account.code,
          });
      }
    }
    return { plan: empty, issues };
  }
  const sha = openingItemsSha256(bytes);
  let file: Fields;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!record(parsed)) throw new SyntaxError("object");
    file = parsed;
  } catch {
    issue("shape", "openingItems", "file is not a UTF-8 JSON object");
    return { plan: { ...empty, sha }, issues };
  }
  const allowed = (value: Fields, keys: readonly string[], path: string) => {
    for (const key of Object.keys(value))
      if (!keys.includes(key)) issue("shape", `${path}.${key}`, "unknown field");
  };
  allowed(file, ["version", "partnerDimension", "terms", "profiles", "parties", "accounts"], "$");
  if (file.version !== 1) issue("shape", "$.version", "version must be 1");
  const partnerDimension = file.partnerDimension;
  if (partnerDimension !== undefined && (typeof partnerDimension !== "string" || !partnerDimension))
    issue("shape", "$.partnerDimension", "must be a dimension code");
  const list = (key: string): Fields[] => {
    const value = file[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => !record(item))) {
      issue("shape", `$.${key}`, "must be an array of objects");
      return [];
    }
    return value as Fields[];
  };
  const configs: { company: string; config: TradeConfig }[] = [];
  const known = new Map<string, TradeConfig>();
  const define = (
    kind: TradeConfig["kind"],
    key: string,
    fields: readonly string[],
    build: (row: Fields) => TradeConfig["data"],
  ) => {
    for (const [index, row] of list(key).entries()) {
      const path = `$.${key}.${index}`;
      allowed(row, ["company", "code", ...fields], path);
      const company = String(row.company ?? "");
      const scope = { company };
      if (!companies.has(company)) {
        issue(kind === "tradeParty" ? "3" : "mapping", `${path}.company`, "unknown company", scope);
        continue;
      }
      const config = {
        kind,
        code: row.code,
        active: true,
        revision: 1,
        data: build(row),
      } as TradeConfig;
      try {
        validateTradeConfig(config);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        issue(kind === "tradeParty" ? "3" : "mapping", path, `invalid ${kind}`, scope);
        continue;
      }
      const id = `${company}:${kind}:${config.code}`;
      if (known.has(id)) {
        issue(kind === "tradeParty" ? "3" : "mapping", path, `duplicate ${kind} code`, scope);
        continue;
      }
      known.set(id, config);
      configs.push({ company, config });
    }
  };
  const window = (row: Fields) => ({
    name: row.name as string,
    from: row.from as string,
    to: row.to as string,
  });
  define(
    "tradeTerms",
    "terms",
    ["name", "from", "to", "dueDays", "discountDays", "discountPercent", "allowPartialDiscount"],
    (row) => ({
      ...window(row),
      dueDays: row.dueDays as number,
      discountDays: row.discountDays as number,
      discountPercent: row.discountPercent as string,
      allowPartialDiscount: row.allowPartialDiscount as boolean,
    }),
  );
  define(
    "tradeProfile",
    "profiles",
    [
      "name",
      "from",
      "to",
      "side",
      "controlAccount",
      "advanceAccount",
      "cashAccount",
      "discountAccount",
    ],
    (row) => ({
      ...window(row),
      side: row.side as "AP" | "AR",
      controlAccount: row.controlAccount as string,
      advanceAccount: row.advanceAccount as string,
      cashAccount: row.cashAccount as string,
      discountAccount: row.discountAccount as string,
    }),
  );
  define(
    "tradeParty",
    "parties",
    [
      "name",
      "from",
      "to",
      "role",
      "apProfile",
      "arProfile",
      "terms",
      "allowedTaxCodes",
      "defaultDimensions",
    ],
    (row) => ({
      ...window(row),
      role: row.role as "vendor" | "customer" | "both",
      apProfile: (row.apProfile ?? null) as string | null,
      arProfile: (row.arProfile ?? null) as string | null,
      terms: row.terms as string,
      allowedTaxCodes: (row.allowedTaxCodes ?? []) as string[],
      defaultDimensions: (row.defaultDimensions ?? {}) as DimensionMap,
    }),
  );
  // Mirror TradeMasterService.save reference checks against the staged target configuration.
  for (const { company, config } of configs) {
    const rule: OpeningRule = config.kind === "tradeParty" ? "3" : "mapping";
    const scope = { company };
    const path = `${config.kind}:${config.code}`;
    const reference = (kind: TradeConfig["kind"], code: string, field: string) => {
      const found = known.get(`${company}:${kind}:${code}`);
      if (!found || found.data.from > config.data.from || found.data.to < config.data.to) {
        issue(rule, `${path}.${field}`, `${kind} ${code} missing or window does not cover`, scope);
        return null;
      }
      return found;
    };
    const role = (code: string, use: TradeAccountRole, side: "AP" | "AR") => {
      try {
        assertTradeAccount(accounts.get(`${company}:${code}`) ?? null, use, side);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        issue(rule, `${path}.${use}`, `account ${code} is not a valid ${side} ${use}`, scope);
      }
    };
    if (config.kind === "tradeProfile")
      for (const use of [
        "controlAccount",
        "advanceAccount",
        "cashAccount",
        "discountAccount",
      ] as const)
        role(config.data[use], use, config.data.side);
    if (config.kind === "tradeParty") {
      const d = config.data;
      reference("tradeTerms", d.terms, "terms");
      for (const [code, side] of [
        [d.apProfile, "AP"],
        [d.arProfile, "AR"],
      ] as const) {
        if (code === null) continue;
        const found = reference("tradeProfile", code, side === "AP" ? "apProfile" : "arProfile");
        if (found && (found.kind !== "tradeProfile" || found.data.side !== side))
          issue("3", `${path}.${side === "AP" ? "apProfile" : "arProfile"}`, "profile side", scope);
      }
      for (const code of d.allowedTaxCodes)
        issue("3", `${path}.allowedTaxCodes`, `tax code ${code} does not exist in target`, scope);
      for (const [key, value] of Object.entries(d.defaultDimensions))
        if (
          !catalog.get(company)?.has(`D:${key}`) ||
          (value !== null && !catalog.get(company)?.has(`V:${key}:${value}`))
        )
          issue("3", `${path}.defaultDimensions.${key}`, "unknown dimension", scope);
    }
  }
  const declarations = new Map<string, { declaration: "detail" | "empty"; rows: Fields[] }>();
  for (const [index, row] of list("accounts").entries()) {
    const path = `$.accounts.${index}`;
    allowed(row, ["company", "account", "declaration", "items"], path);
    const company = String(row.company ?? ""),
      code = String(row.account ?? ""),
      key = `${company}:${code}`;
    const scope = { company, account: code };
    const target = accounts.get(key);
    if (
      target?.purpose !== "control" ||
      (target.controlModule !== "AP" && target.controlModule !== "AR")
    ) {
      issue(
        "1",
        path,
        "declaration for an account that is not an AP/AR control account in scope",
        scope,
      );
      continue;
    }
    if (declarations.has(key)) {
      issue("1", path, "duplicate declaration", scope);
      continue;
    }
    if (row.declaration !== "detail" && row.declaration !== "empty") {
      issue("1", `${path}.declaration`, "declaration must be detail or empty", scope);
      continue;
    }
    const items = row.items ?? [];
    if (!Array.isArray(items) || items.some((item) => !record(item))) {
      issue("shape", `${path}.items`, "must be an array of objects", scope);
      continue;
    }
    if (row.declaration === "empty" && items.length) {
      issue("1", `${path}.items`, "empty declaration must not list items", scope);
      continue;
    }
    if (row.declaration === "detail" && !items.length) {
      issue("1", `${path}.items`, "detail declaration without rows", scope);
      continue;
    }
    declarations.set(key, { declaration: row.declaration, rows: items as Fields[] });
  }
  const result: OpeningAccount[] = [];
  const entries: OpeningEntry[] = [];
  const seen = new Set<string>();
  const partySums = new Map<string, Map<string, bigint>>();
  for (const c of controls) {
    const code = c.account.code,
      company = c.company,
      scope = { company, account: code };
    const owner = companies.get(company);
    const declared = declarations.get(c.key);
    const balance = balances.get(c.key) ?? 0n;
    if (!declared || !owner) {
      issue("1", "accounts", "missing detail/empty declaration", scope);
      if (balance !== 0n)
        issue("2", "accounts", `declared 0 but LEGACY GL balance is ${balance}`, scope);
      continue;
    }
    const side = c.account.controlModule as "AP" | "AR";
    const cutover = cutovers.get(company) ?? `${owner.year}-12-31`;
    let total = 0n;
    const sums = new Map<string, bigint>();
    partySums.set(c.key, sums);
    for (const [index, row] of declared.rows.entries()) {
      const path = `${code}.items.${index}`;
      allowed(
        row,
        [
          "side",
          "party",
          "partyName",
          "externalNo",
          "documentDate",
          "dueDate",
          "remainingMinor",
          "currency",
          "legacyJournal",
          "dimensions",
        ],
        path,
      );
      const amount = minor(row.remainingMinor);
      if (amount === null)
        issue("shape", `${path}.remainingMinor`, "signed integer minor units", scope);
      else total += amount;
      let valid = amount !== null;
      if (row.side !== side) {
        issue("mapping", `${path}.side`, `account ${code} is ${side}`, scope);
        valid = false;
      }
      if (row.currency !== owner.currency) {
        issue("mapping", `${path}.currency`, `must be company currency ${owner.currency}`, scope);
        valid = false;
      }
      const partyCode = typeof row.party === "string" ? row.party : "";
      const party = partyCode ? known.get(`${company}:tradeParty:${partyCode}`) : undefined;
      if (!partyCode) {
        issue("3", `${path}.party`, "party code is empty", scope);
        valid = false;
      } else if (party?.kind !== "tradeParty") {
        issue("3", `${path}.party`, `party ${partyCode} is not defined or invalid`, scope);
        valid = false;
      } else {
        if (row.partyName !== party.data.name) {
          issue("3", `${path}.partyName`, `conflicts with party ${partyCode} name`, scope);
          valid = false;
        }
        if (
          party.data.role !== "both" &&
          party.data.role !== (side === "AP" ? "vendor" : "customer")
        ) {
          issue(
            "3",
            `${path}.party`,
            `party role ${party.data.role} is incompatible with ${side}`,
            scope,
          );
          valid = false;
        }
      }
      const external = typeof row.externalNo === "string" ? row.externalNo : "";
      const normalized = normalizeExternalInvoice(external);
      if (
        !normalized ||
        external.length > 100 ||
        normalized.length > 100 ||
        control.test(external)
      ) {
        issue("4", `${path}.externalNo`, "missing or invalid external document number", scope);
        valid = false;
      } else if (partyCode) {
        const duplicate = `${company}:${side}:${partyCode}:${normalized}`;
        if (seen.has(duplicate)) {
          issue(
            "4",
            `${path}.externalNo`,
            `duplicate external number ${normalized} for ${partyCode}`,
            scope,
          );
          valid = false;
        }
        seen.add(duplicate);
      }
      for (const field of ["documentDate", "dueDate"] as const)
        if (!day(row[field])) {
          issue("4", `${path}.${field}`, "missing or invalid date", scope);
          valid = false;
        }
      if (valid && String(row.dueDate) < String(row.documentDate)) {
        issue("4", `${path}.dueDate`, "due date precedes document date", scope);
        valid = false;
      }
      if (amount === 0n) {
        issue("4", `${path}.remainingMinor`, "amount must not be 0", scope);
        valid = false;
      }
      const dims = dimensions(row.dimensions);
      if (!dims) {
        issue("mapping", `${path}.dimensions`, "dimensions must map codes to value codes", scope);
        valid = false;
      } else
        for (const [key, value] of Object.entries(dims))
          if (
            !catalog.get(company)?.has(`D:${key}`) ||
            !catalog.get(company)?.has(`V:${key}:${value}`)
          ) {
            issue("mapping", `${path}.dimensions.${key}`, "unknown dimension value", scope);
            valid = false;
          }
      // D30: one ordered source-journal rule, fail-closed.
      let journal: string | null = null;
      if (row.legacyJournal !== undefined) {
        if (typeof row.legacyJournal !== "string" || !row.legacyJournal)
          issue("mapping", `${path}.legacyJournal`, "must be a legacy journal id", scope);
        else if (!touches.get(company, row.legacyJournal, code))
          issue(
            "mapping",
            `${path}.legacyJournal`,
            `historical journal ${row.legacyJournal} has no line on ${code}`,
            scope,
          );
        else journal = row.legacyJournal;
      } else {
        const found = latest.get(company, code) as { legacy: string } | undefined;
        if (found) journal = found.legacy;
        else issue("mapping", `${path}.legacyJournal`, `no LEGACY journal touches ${code}`, scope);
      }
      if (!journal) valid = false;
      if (amount !== null && partyCode) sums.set(partyCode, (sums.get(partyCode) ?? 0n) + amount);
      if (!valid || amount === null || !journal || !dims) continue;
      const gross = Number(amount < 0n ? -amount : amount);
      const invoice = side === "AR" ? amount > 0n : amount < 0n;
      const itemId = openingItemId(company, side, partyCode, normalized);
      const evidence = {
        account: code,
        currency: owner.currency,
        dimensions: dims,
        documentDate: row.documentDate,
        dueDate: row.dueDate,
        externalNo: external,
        legacyJournal: journal,
        party: partyCode,
        partyName: row.partyName,
        remainingMinor: String(amount),
        side,
        sha,
      };
      entries.push({
        source: c.account.source,
        company,
        legacyId: `${company}:${side}:${partyCode}:${normalized}`,
        journalLegacyRef: journal,
        evidence: canonical(evidence),
        item: {
          kind: invoice ? "invoice" : "advance",
          itemId,
          side,
          party: partyCode,
          externalNo: external,
          controlAccount: code,
          dimensions: dims,
          currency: owner.currency,
          accountingDate: cutover,
          documentDate: String(row.documentDate),
          dueDate: String(row.dueDate),
          discountDate: String(row.documentDate),
          discountPercent: "0",
          allowPartialDiscount: false,
          segments: tradeSegments([{ dimensions: dims, gross }]),
          gross,
          net: gross,
          tax: 0,
          remainingGross: gross,
          remainingNet: gross,
          remainingTax: 0,
          status: "open",
          revision: 1,
        },
      });
    }
    if (total !== balance)
      issue(
        "2",
        "accounts",
        `detail total ${total} differs from LEGACY GL balance ${balance}`,
        scope,
      );
    result.push({
      source: c.account.source,
      company,
      account: code,
      side,
      cutover,
      balanceMinor: String(balance),
      declaration: declared.declaration,
      rows: declared.rows.length,
    });
  }
  if (typeof partnerDimension === "string" && partnerDimension) {
    const tagged = plan.prepare(
      `SELECT json_extract(d.target,'$.value_code') AS party,
      sum(CAST(json_extract(l.target,'$.debit_minor') AS INTEGER)-CAST(json_extract(l.target,'$.credit_minor') AS INTEGER)) AS balance
      FROM planned d JOIN planned l ON l.source=d.source AND l.object='lines' AND l.legacy=d.parent AND l.company=d.company
      JOIN planned j ON j.source=l.source AND j.object='journals' AND j.legacy=l.parent AND j.company=l.company
      WHERE d.object='line_dimensions' AND json_extract(j.target,'$.status')='historical'
        AND l.company=? AND json_extract(l.target,'$.account_code')=? AND json_extract(d.target,'$.dimension_code')=?
      GROUP BY 1`,
    );
    for (const c of controls) {
      const legacy = new Map(
        (
          tagged.safeIntegers(true).all(c.company, c.account.code, partnerDimension) as {
            party: string;
            balance: bigint;
          }[]
        ).map((row) => [row.party, BigInt(row.balance)]),
      );
      if (!legacy.size) continue;
      const file = partySums.get(c.key) ?? new Map<string, bigint>();
      for (const party of [...new Set([...legacy.keys(), ...file.keys()])].sort())
        if ((legacy.get(party) ?? 0n) !== (file.get(party) ?? 0n))
          issue(
            "5",
            `${c.account.code}.${party}`,
            `party ${party}: file ${file.get(party) ?? 0n} vs legacy ${partnerDimension} ${legacy.get(party) ?? 0n}`,
            { company: c.company, account: c.account.code },
          );
    }
  }
  const order = { tradeTerms: 0, tradeProfile: 1, tradeParty: 2 } as Record<string, number>;
  return {
    plan: {
      sha,
      configs: configs.sort(
        (a, b) =>
          a.company.localeCompare(b.company) ||
          order[a.config.kind] - order[b.config.kind] ||
          a.config.code.localeCompare(b.config.code),
      ),
      accounts: result,
      entries,
    },
    issues,
  };
}

export function openingItemsError(issues: readonly OpeningIssue[]): StorageError {
  const error = new StorageError("INVALID_INPUT");
  error.message = `Opening items are not importable (${issues.length} issue(s)):\n${issues
    .map(
      (item) =>
        `- rule ${item.rule}${item.company ? ` ${item.company}` : ""}${item.account ? `/${item.account}` : ""} ${item.path}: ${item.detail}`,
    )
    .join("\n")}`;
  return error;
}
