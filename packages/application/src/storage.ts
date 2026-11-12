const messages = {
  INVALID_INPUT: 'Invalid storage input.',
  INVALID_SCOPE: 'Invalid storage scope.',
  NOT_FOUND: 'The requested record does not exist.',
  CONFLICT: 'The stored binding or revision conflicts.',
  OVERFLOW: 'The exact integer range was exceeded.',
  BUSY: 'The storage resource is busy.',
  CLOSED: 'The storage resource is closed.',
  INVALID_SNAPSHOT: 'The verified snapshot is not valid.',
  INVALID_CURSOR: 'The snapshot cursor is not valid.',
  SCHEMA_MISMATCH: 'Explicit schema verification or migration is required.',
  TRANSACTION_ABORTED: 'The transaction was rolled back.',
  TRANSACTION_TIMEOUT: 'The transaction exceeded its execution budget.',
  COMMIT_UNKNOWN: 'The commit outcome is unknown; do not replay automatically.',
  NESTED_UOW: 'Nested work on the same storage instance is not allowed.',
  PENDING_OPERATIONS: 'The callback returned with unfinished storage work.',
  STORAGE_FAILURE: 'The storage operation failed.',
} as const;

export type StorageErrorCode = keyof typeof messages;

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(messages[code]);
    this.name = 'StorageError';
  }
}

export interface TenantScope { readonly level: 'tenant'; readonly tenantId: string }
export interface BookScope { readonly level: 'book'; readonly tenantId: string; readonly bookId: string }
export interface CompanyScope {
  readonly level: 'company';
  readonly tenantId: string;
  readonly bookId: string;
  readonly companyId: string;
}
export type StorageScope = TenantScope | BookScope | CompanyScope;
export type ScopeLevel = StorageScope['level'];
export interface TenantLockPlan { readonly level: 'tenant'; readonly scopes: readonly TenantScope[] }
export interface BookLockPlan { readonly level: 'book'; readonly scopes: readonly BookScope[] }
export interface CompanyLockPlan { readonly level: 'company'; readonly scopes: readonly CompanyScope[] }
export type LockPlan = TenantLockPlan | BookLockPlan | CompanyLockPlan;

export type JsonValue = null | boolean | string | number | readonly JsonValue[] |
  { readonly [key: string]: JsonValue };

export interface ReceiptBinding {
  readonly scope: CompanyScope;
  readonly operation: string;
  readonly key: string;
  readonly principal: string;
  readonly fingerprint: string;
}
export interface ReceiptInput extends ReceiptBinding { readonly result: unknown }
export interface NormalizedReceiptInput extends ReceiptBinding { readonly result: JsonValue }
export interface StoredReceipt extends NormalizedReceiptInput { readonly version: 1 }
export interface AuditInput {
  readonly scope: CompanyScope;
  readonly operation: string;
  readonly reference: string;
  readonly principal: string;
  readonly details: unknown;
}
export interface NormalizedAuditInput extends Omit<AuditInput, 'details'> { readonly details: JsonValue }
export interface StoredAudit extends NormalizedAuditInput {
  readonly sequence: number;
  readonly recordedAt: string;
}
export interface AuditQuery {
  readonly scope: CompanyScope;
  readonly afterSequence: number;
  readonly limit: number;
}
export interface RevisionReader<S extends StorageScope = StorageScope> { get(scope: S): Promise<number> }
export interface RevisionWriter<S extends StorageScope = StorageScope> extends RevisionReader<S> {
  advance(scope: S, expectedRevision: number): Promise<number>;
}
export interface ReceiptReader { get(binding: ReceiptBinding): Promise<StoredReceipt | null> }
export interface ReceiptWriter extends ReceiptReader { save(input: ReceiptInput): Promise<StoredReceipt> }
export interface AuditReader { list(query: AuditQuery): Promise<readonly StoredAudit[]> }
export interface AuditWriter extends AuditReader { append(input: AuditInput): Promise<StoredAudit> }
export interface TenantWriteSession {
  readonly level: 'tenant';
  readonly scopes: readonly TenantScope[];
  readonly revisions: RevisionWriter<TenantScope>;
}
export interface BookWriteSession {
  readonly level: 'book';
  readonly scopes: readonly BookScope[];
  readonly revisions: RevisionWriter<BookScope>;
}
export interface CompanyWriteSession {
  readonly level: 'company';
  readonly scopes: readonly CompanyScope[];
  readonly revisions: RevisionWriter<CompanyScope>;
  readonly receipts: ReceiptWriter;
  readonly audit: AuditWriter;
}
export type StorageWriteSession = TenantWriteSession | BookWriteSession | CompanyWriteSession;
export interface StorageReadSession {
  readonly scope: CompanyScope;
  readonly revisions: RevisionReader<CompanyScope>;
  readonly receipts: ReceiptReader;
  readonly audit: AuditReader;
}
export interface TransactionOptions { readonly retry?: boolean }
export interface UnitOfWork {
  write<T>(plan: LockPlan, work: (session: StorageWriteSession) => Promise<T> | T,
    options?: TransactionOptions): Promise<T>;
  read<T>(scope: CompanyScope, work: (session: StorageReadSession) => Promise<T> | T): Promise<T>;
  close(): Promise<void>;
}

function invalid(code: StorageErrorCode = 'INVALID_INPUT'): never {
  throw new StorageError(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function record(value: unknown, code: StorageErrorCode = 'INVALID_INPUT'): Record<string, unknown> {
  if (!isPlainRecord(value)) invalid(code);
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(code);
    Object.defineProperty(snapshot, key, { value: descriptor.value, enumerable: true });
  }
  return snapshot;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: StorageErrorCode): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid(code);
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function scopeId(value: unknown): string {
  if (!matches(value, /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u)) invalid('INVALID_SCOPE');
  return value;
}

export function parseScope(value: unknown): StorageScope {
  const raw = record(value, 'INVALID_SCOPE');
  switch (raw.level) {
    case 'tenant':
      exactKeys(raw, ['level', 'tenantId'], 'INVALID_SCOPE');
      return Object.freeze({ level: 'tenant', tenantId: scopeId(raw.tenantId) });
    case 'book':
      exactKeys(raw, ['level', 'tenantId', 'bookId'], 'INVALID_SCOPE');
      return Object.freeze({ level: 'book', tenantId: scopeId(raw.tenantId), bookId: scopeId(raw.bookId) });
    case 'company':
      exactKeys(raw, ['level', 'tenantId', 'bookId', 'companyId'], 'INVALID_SCOPE');
      return Object.freeze({ level: 'company', tenantId: scopeId(raw.tenantId),
        bookId: scopeId(raw.bookId), companyId: scopeId(raw.companyId) });
    default: return invalid('INVALID_SCOPE');
  }
}

function scopeParts(scope: StorageScope): readonly string[] {
  switch (scope.level) {
    case 'tenant': return [scope.tenantId];
    case 'book': return [scope.tenantId, scope.bookId];
    case 'company': return [scope.tenantId, scope.bookId, scope.companyId];
  }
}

export function compareScopes(left: StorageScope, right: StorageScope): number {
  const rank = { tenant: 0, book: 1, company: 2 };
  if (left.level !== right.level) return rank[left.level] - rank[right.level];
  const a = scopeParts(left);
  const b = scopeParts(right);
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function parseLockPlan(value: unknown): LockPlan {
  const raw = record(value, 'INVALID_SCOPE');
  exactKeys(raw, ['level', 'scopes'], 'INVALID_SCOPE');
  const input = raw.scopes;
  if (!Array.isArray(input) || input.length === 0 ||
    (Object.getPrototypeOf(input) !== Array.prototype && Object.getPrototypeOf(input) !== null) ||
    Reflect.ownKeys(input).length !== input.length + 1) invalid('INVALID_SCOPE');
  const scopes: StorageScope[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid('INVALID_SCOPE');
    scopes.push(parseScope(descriptor.value));
  }
  scopes.sort(compareScopes);
  for (let index = 1; index < scopes.length; index++) {
    if (compareScopes(scopes[index - 1], scopes[index]) === 0) invalid('INVALID_SCOPE');
  }
  if (raw.level === 'tenant' && scopes.every((scope): scope is TenantScope => scope.level === 'tenant')) {
    return Object.freeze({ level: 'tenant', scopes: Object.freeze(scopes) });
  }
  if (raw.level === 'book' && scopes.every((scope): scope is BookScope => scope.level === 'book')) {
    return Object.freeze({ level: 'book', scopes: Object.freeze(scopes) });
  }
  if (raw.level === 'company' && scopes.every((scope): scope is CompanyScope => scope.level === 'company')) {
    return Object.freeze({ level: 'company', scopes: Object.freeze(scopes) });
  }
  return invalid('INVALID_SCOPE');
}

export function checkedRevision(value: unknown): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

export function nextRevision(value: unknown): number {
  const current = checkedRevision(value);
  if (current === Number.MAX_SAFE_INTEGER) invalid('OVERFLOW');
  return current + 1;
}

export function canonicalJson(value: unknown): string {
  const pieces: string[] = [];
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  let bytes = 0;
  const append = (piece: string): void => {
    bytes += encoder.encode(piece).byteLength;
    if (bytes > 65536) invalid();
    pieces.push(piece);
  };
  const primitive = (item: string | number | boolean | null): void => {
    if (typeof item === 'string' && item.length > 65536) invalid();
    const encoded = JSON.stringify(item);
    if (typeof encoded !== 'string') invalid();
    append(encoded);
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > 20) invalid();
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return primitive(item);
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) invalid();
      return primitive(item);
    }
    if (typeof item !== 'object' || ancestors.has(item)) invalid();
    ancestors.add(item);
    if (Array.isArray(item)) {
      const prototype = Object.getPrototypeOf(item);
      if ((prototype !== Array.prototype && prototype !== null) || item.length > 2000 ||
        Reflect.ownKeys(item).length !== item.length + 1) invalid();
      append('[');
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid();
        if (index) append(',');
        visit(descriptor.value, depth + 1);
      }
      append(']');
    } else {
      const object = record(item);
      const keys = Object.keys(object).sort();
      if (keys.length > 2000) invalid();
      append('{');
      keys.forEach((key, index) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') invalid();
        if (index) append(',');
        primitive(key);
        append(':');
        visit(object[key], depth + 1);
      });
      append('}');
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  return pieces.join('');
}

function assertJsonValue(value: unknown): asserts value is JsonValue {
  canonicalJson(value);
}

function freezeJson(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function immutableJson(value: unknown): JsonValue {
  const normalized: unknown = JSON.parse(canonicalJson(value));
  assertJsonValue(normalized);
  return freezeJson(normalized);
}

function companyScope(value: unknown): CompanyScope {
  const scope = parseScope(value);
  if (scope.level !== 'company') invalid('INVALID_SCOPE');
  return scope;
}

function operation(value: unknown): string {
  if (!matches(value, /^[a-z][a-z0-9_.:-]{0,59}$/u)) invalid();
  return value;
}

function reference(value: unknown): string {
  if (!matches(value, /^[\x20-\x7e]{1,100}$/u)) invalid();
  return value;
}

function principal(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 255 ||
    /[\x00-\x1f\x7f-\x9f\ud800-\udfff]/u.test(value)) invalid();
  return value;
}

function bindingFields(raw: Record<string, unknown>): ReceiptBinding {
  if (!matches(raw.fingerprint, /^[0-9a-f]{64}$/u)) invalid();
  return { scope: companyScope(raw.scope), operation: operation(raw.operation), key: reference(raw.key),
    principal: principal(raw.principal), fingerprint: raw.fingerprint };
}

export function parseReceiptBinding(value: unknown): ReceiptBinding {
  const raw = record(value);
  exactKeys(raw, ['scope', 'operation', 'key', 'principal', 'fingerprint'], 'INVALID_INPUT');
  return Object.freeze(bindingFields(raw));
}

export function parseReceiptInput(value: unknown): NormalizedReceiptInput {
  const raw = record(value);
  exactKeys(raw, ['scope', 'operation', 'key', 'principal', 'fingerprint', 'result'], 'INVALID_INPUT');
  return Object.freeze({ ...bindingFields(raw), result: immutableJson(raw.result) });
}

export function parseAuditInput(value: unknown): NormalizedAuditInput {
  const raw = record(value);
  exactKeys(raw, ['scope', 'operation', 'reference', 'principal', 'details'], 'INVALID_INPUT');
  return Object.freeze({ scope: companyScope(raw.scope), operation: operation(raw.operation),
    reference: reference(raw.reference), principal: principal(raw.principal), details: immutableJson(raw.details) });
}

export function parseAuditQuery(value: unknown): AuditQuery {
  const raw = record(value);
  exactKeys(raw, ['scope', 'afterSequence', 'limit'], 'INVALID_INPUT');
  if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 100) invalid();
  return Object.freeze({ scope: companyScope(raw.scope), afterSequence: checkedRevision(raw.afterSequence),
    limit: raw.limit });
}
