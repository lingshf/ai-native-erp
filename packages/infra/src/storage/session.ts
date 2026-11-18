import {
  StorageError,
  canonicalJson,
  checkedRevision,
  compareScopes,
  immutableJson,
  nextRevision,
  parseAuditInput,
  parseAuditQuery,
  parseReceiptBinding,
  parseReceiptInput,
  parseScope,
} from "@erp/core/application";
import type {
  AuditInput,
  AuditQuery,
  CompanyScope,
  LockPlan,
  ReceiptBinding,
  ReceiptInput,
  StorageReadSession,
  StorageScope,
  StorageWriteSession,
  StoredAudit,
  StoredReceipt,
} from "@erp/core/application";
import { performance } from "node:perf_hooks";
import { storageError } from "./errors.ts";
import type { Connection, Parameters, Row } from "./types.ts";

export function scopeValues(scope: StorageScope): readonly string[] {
  switch (scope.level) {
    case "tenant":
      return [scope.tenantId];
    case "book":
      return [scope.tenantId, scope.bookId];
    case "company":
      return [scope.tenantId, scope.bookId, scope.companyId];
  }
}
export function scopeWhere(scope: StorageScope): string {
  return ["tenant_id", "book_id", "company_id"]
    .slice(0, scopeValues(scope).length)
    .map((id) => `${id}=?`)
    .join(" AND ");
}
export function scopeTable(scope: StorageScope): string {
  return { tenant: "tenants", book: "books", company: "companies" }[scope.level];
}

function company(scope: StorageScope): asserts scope is CompanyScope {
  if (scope.level !== "company") throw new StorageError("INVALID_SCOPE");
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return value;
}
function json(text: unknown): unknown {
  try {
    const raw = string(text);
    const parsed: unknown = JSON.parse(raw);
    if (canonicalJson(parsed) !== raw) throw new StorageError("STORAGE_FAILURE");
    return parsed;
  } catch {
    throw new StorageError("STORAGE_FAILURE");
  }
}

export class Session {
  private active = true;
  private failure: StorageError | undefined;
  private readonly pending = new Set<Promise<unknown>>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly started = performance.now();
  private readonly connection: Connection;
  private readonly plan: LockPlan;
  private readonly writable: boolean;
  constructor(connection: Connection, plan: LockPlan, writable: boolean) {
    this.connection = connection;
    this.plan = plan;
    this.writable = writable;
  }

  invalidate(): void {
    this.active = false;
  }

  private authorize(input: unknown): StorageScope {
    const scope = parseScope(input);
    if (
      scope.level !== this.plan.level ||
      !this.plan.scopes.some((allowed) => compareScopes(allowed, scope) === 0)
    )
      throw new StorageError("INVALID_SCOPE");
    return scope;
  }

  private operation<T>(work: () => Promise<T>): Promise<T> {
    if (!this.active) return Promise.reject(new StorageError("CLOSED"));
    if (this.pending.size >= 64) {
      this.failure ??= new StorageError("BUSY");
      return Promise.reject(this.failure);
    }
    const promise = this.tail.then(async () => {
      if (!this.active) throw new StorageError("CLOSED");
      if (performance.now() - this.started > 10000) throw new StorageError("TRANSACTION_TIMEOUT");
      if (this.failure) throw this.failure;
      try {
        const result = await work();
        if (performance.now() - this.started > 10000) throw new StorageError("TRANSACTION_TIMEOUT");
        return result;
      } catch (error) {
        this.failure ??= storageError(error);
        throw this.failure;
      }
    });
    this.tail = promise.catch(() => undefined);
    this.pending.add(promise);
    void promise.then(
      () => this.pending.delete(promise),
      (error: unknown) => {
        this.failure ??= storageError(error);
        this.pending.delete(promise);
      },
    );
    return promise;
  }

  async finish(): Promise<void> {
    this.active = false;
    const unfinished = this.pending.size !== 0;
    await Promise.allSettled([...this.pending]);
    if (unfinished) throw new StorageError("PENDING_OPERATIONS");
    if (this.failure) throw this.failure;
    if (performance.now() - this.started > 10000) throw new StorageError("TRANSACTION_TIMEOUT");
  }

  async drain(): Promise<void> {
    this.active = false;
    await Promise.allSettled([...this.pending]);
  }

  private async revision(input: unknown): Promise<number> {
    const scope = this.authorize(input);
    const rows = await this.connection.query(
      `SELECT revision FROM ${scopeTable(scope)} WHERE ${scopeWhere(scope)}`,
      scopeValues(scope),
    );
    if (rows.length !== 1) throw new StorageError("NOT_FOUND");
    return checkedRevision(rows[0].revision);
  }

  private async getReceipt(input: unknown): Promise<StoredReceipt | null> {
    const binding = parseReceiptBinding(input);
    this.authorize(binding.scope);
    const rows = await this.connection.query(
      "SELECT principal,fingerprint,result,version FROM receipts WHERE tenant_id=? AND book_id=? AND company_id=? AND operation=? AND receipt_key=?",
      [...scopeValues(binding.scope), binding.operation, binding.key],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (row.principal !== binding.principal || row.fingerprint !== binding.fingerprint)
      throw new StorageError("CONFLICT");
    if (checkedRevision(row.version) !== 1) throw new StorageError("STORAGE_FAILURE");
    return Object.freeze({ ...binding, result: immutableJson(json(row.result)), version: 1 });
  }

  private auditRow(scope: CompanyScope, row: Row): StoredAudit {
    const normalized = parseAuditInput({
      scope,
      operation: row.operation,
      reference: row.reference,
      principal: row.principal,
      details: json(row.details),
    });
    const sequence = checkedRevision(row.sequence);
    if (sequence === 0) throw new StorageError("STORAGE_FAILURE");
    const recordedAt = string(row.recorded_at);
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(recordedAt) ||
      !Number.isFinite(Date.parse(recordedAt)) ||
      new Date(recordedAt).toISOString() !== recordedAt
    ) {
      throw new StorageError("STORAGE_FAILURE");
    }
    return Object.freeze({ ...normalized, sequence, recordedAt });
  }

  writeSession(): StorageWriteSession {
    const revisions = Object.freeze({
      get: (scope: StorageScope) => this.operation(() => this.revision(scope)),
      advance: (input: StorageScope, expected: number) =>
        this.operation(async () => {
          if (!this.writable) throw new StorageError("INVALID_SCOPE");
          const scope = this.authorize(input);
          const current = checkedRevision(expected);
          const next = nextRevision(current);
          const rows = await this.connection.query(
            `UPDATE ${scopeTable(scope)} SET revision=? WHERE ${scopeWhere(scope)} AND revision=? RETURNING revision`,
            [next, ...scopeValues(scope), current],
          );
          if (rows.length !== 1) throw new StorageError("CONFLICT");
          return checkedRevision(rows[0].revision);
        }),
    });
    switch (this.plan.level) {
      case "tenant":
        return Object.freeze({ level: "tenant", scopes: this.plan.scopes, revisions });
      case "book":
        return Object.freeze({ level: "book", scopes: this.plan.scopes, revisions });
      case "company":
        return Object.freeze({
          level: "company",
          scopes: this.plan.scopes,
          revisions,
          receipts: Object.freeze({
            get: (binding: ReceiptBinding) => this.operation(() => this.getReceipt(binding)),
            save: (input: ReceiptInput) =>
              this.operation(async () => {
                const normalized = parseReceiptInput(input);
                this.authorize(normalized.scope);
                const { result: _result, ...binding } = normalized;
                const previous = await this.getReceipt(binding);
                if (previous) return previous;
                await this.connection.query(
                  "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version) VALUES(?,?,?,?,?,?,?,?,?)",
                  [
                    ...scopeValues(normalized.scope),
                    normalized.operation,
                    normalized.key,
                    normalized.principal,
                    normalized.fingerprint,
                    canonicalJson(normalized.result),
                    1,
                  ],
                );
                return Object.freeze({ ...normalized, version: 1 as const });
              }),
          }),
          audit: Object.freeze({
            list: (query: AuditQuery) => this.operation(() => this.listAudit(query)),
            append: (input: AuditInput) =>
              this.operation(async () => {
                const normalized = parseAuditInput(input);
                this.authorize(normalized.scope);
                const rows = await this.connection.query(
                  "SELECT max(sequence) AS last FROM audit WHERE tenant_id=? AND book_id=? AND company_id=?",
                  scopeValues(normalized.scope),
                );
                const sequence = nextRevision(rows[0]?.last ?? 0);
                const recordedAt = new Date().toISOString();
                await this.connection.query(
                  "INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)",
                  [
                    ...scopeValues(normalized.scope),
                    sequence,
                    normalized.operation,
                    normalized.reference,
                    normalized.principal,
                    canonicalJson(normalized.details),
                    recordedAt,
                  ],
                );
                return Object.freeze({ ...normalized, sequence, recordedAt });
              }),
          }),
        });
    }
  }

  private async listAudit(input: unknown): Promise<readonly StoredAudit[]> {
    const query = parseAuditQuery(input);
    const scope = this.authorize(query.scope);
    company(scope);
    const parameters: Parameters = [...scopeValues(scope), query.afterSequence, query.limit];
    const rows = await this.connection.query(
      "SELECT sequence,operation,reference,principal,details,recorded_at FROM audit WHERE tenant_id=? AND book_id=? AND company_id=? AND sequence>? ORDER BY sequence ASC LIMIT ?",
      parameters,
    );
    return Object.freeze(rows.map((row) => this.auditRow(scope, row)));
  }

  readSession(): StorageReadSession {
    const scope = this.plan.scopes[0];
    company(scope);
    return Object.freeze({
      scope,
      revisions: Object.freeze({
        get: (input: CompanyScope) => this.operation(() => this.revision(input)),
      }),
      receipts: Object.freeze({
        get: (input: ReceiptBinding) => this.operation(() => this.getReceipt(input)),
      }),
      audit: Object.freeze({
        list: (input: AuditQuery) => this.operation(() => this.listAudit(input)),
      }),
    });
  }
}

export async function lockScopes(connection: Connection, plan: LockPlan): Promise<void> {
  const tiers: StorageScope[][] = [[], [], []];
  for (const scope of plan.scopes) {
    tiers[0].push({ level: "tenant", tenantId: scope.tenantId });
    if (scope.level !== "tenant")
      tiers[1].push({ level: "book", tenantId: scope.tenantId, bookId: scope.bookId });
    if (scope.level === "company") tiers[2].push(scope);
  }
  for (const tier of tiers) {
    tier.sort(compareScopes);
    let previous: StorageScope | undefined;
    for (const scope of tier) {
      if (previous && compareScopes(previous, scope) === 0) continue;
      previous = scope;
      const rows = await connection.query(
        `SELECT revision FROM ${scopeTable(scope)} WHERE ${scopeWhere(scope)}`,
        scopeValues(scope),
      );
      if (rows.length !== 1) throw new StorageError("NOT_FOUND");
    }
  }
}
