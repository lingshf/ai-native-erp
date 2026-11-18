import assert from "node:assert/strict";
import { test } from "vitest";
import {
  StorageError,
  canonicalJson,
  immutableJson,
  parseScope,
  parseLockPlan,
  parseReceiptBinding,
  parseReceiptInput,
  parseAuditInput,
  parseAuditQuery,
  checkedRevision,
  nextRevision,
} from "../../src/application/storage.ts";

const company = { level: "company", tenantId: "T1", bookId: "B1", companyId: "C1" };
const binding = {
  scope: company,
  operation: "adapter.contract",
  key: "key-1",
  principal: "fixture-user",
  fingerprint: "a".repeat(64),
};
const invalid = (run, code = "INVALID_INPUT") =>
  assert.throws(run, (error) => error instanceof StorageError && error.code === code);

test("scope normalization copies, freezes and preserves exact tier identity", () => {
  for (const input of [
    { level: "tenant", tenantId: "T1" },
    { level: "book", tenantId: "T1", bookId: "B1" },
    company,
  ]) {
    const output = parseScope(input);
    assert.deepEqual(output, input);
    assert.notEqual(output, input);
    assert.equal(Object.isFrozen(output), true);
  }
  const input = { ...company };
  const normalized = parseScope(input);
  input.companyId = "C2";
  assert.equal(normalized.companyId, "C1");
});

test("scope rejects missing, extra, malformed, newline and accessor IDs without evaluating getters", () => {
  for (const value of [
    null,
    {},
    { level: "tenant", tenantId: "T1", bookId: "B1" },
    { level: "company", tenantId: "T1", bookId: "B1" },
    { ...company, companyId: "" },
    { ...company, companyId: "lower" },
    { ...company, companyId: "A\n" },
    { ...company, companyId: "A".repeat(61) },
    { ...company, companyId: "A/B" },
    { ...company, extra: true },
    Object.assign(Object.create({ extra: true }), company),
    { ...company, [Symbol("extra")]: true },
  ])
    invalid(() => parseScope(value), "INVALID_SCOPE");
  invalid(
    () =>
      parseScope({
        ...company,
        get companyId() {
          return assert.fail("getter executed");
        },
      }),
    "INVALID_SCOPE",
  );
});

test("lock plans are copied, ASCII sorted and reject tier mixing or duplicate locks", () => {
  const input = {
    level: "company",
    scopes: ["B", "A_", "A0", "A."].map((companyId) => ({ ...company, companyId })),
  };
  const plan = parseLockPlan(input);
  assert.deepEqual(
    plan.scopes.map((scope) => scope.companyId),
    ["A.", "A0", "A_", "B"],
  );
  input.scopes.reverse();
  assert.equal(Object.isFrozen(plan.scopes), true);
  for (const value of [
    { level: "company", scopes: [] },
    { level: "company", scopes: [company, { level: "tenant", tenantId: "T1" }] },
    { level: "book", scopes: [company] },
    { level: "company", scopes: [company, { ...company }] },
    { level: "company", scopes: Array(1) },
    // biome-ignore lint/suspicious/noSparseArray: Deliberate malformed lock plan must be rejected.
    { level: "company", scopes: [company, , company] },
    {
      level: "company",
      scopes: Object.assign([company], {
        map() {
          assert.fail("custom map executed");
        },
      }),
    },
    {
      level: "company",
      scopes: Object.defineProperty([company], 0, {
        get() {
          assert.fail("scope getter executed");
        },
        enumerable: true,
      }),
    },
    { ...input, anything: true },
  ])
    invalid(() => parseLockPlan(value), "INVALID_SCOPE");
});

test("canonical JSON is deterministic and ignores neither unsafe values nor dangerous fields", () => {
  assert.equal(
    canonicalJson({ z: [true, null, -0], a: { x: 2 } }),
    '{"a":{"x":2},"z":[true,null,0]}',
  );
  assert.equal(canonicalJson(Object.assign(Object.create(null), { b: 2, a: 1 })), '{"a":1,"b":2}');
  const shared = { ok: true };
  assert.equal(canonicalJson([shared, shared]), '[{"ok":true},{"ok":true}]');
  const cycle = {};
  cycle.self = cycle;
  for (const value of [
    NaN,
    Infinity,
    1.1,
    Number.MAX_SAFE_INTEGER + 1,
    1n,
    undefined,
    () => {},
    new Date(),
    new Map(),
    cycle,
    [undefined],
    Array(1),
    JSON.parse('{"__proto__":{"bad":true}}'),
    { constructor: "bad" },
    { prototype: {} },
    { [Symbol("x")]: 1 },
    Object.defineProperty({}, "hidden", { value: 1 }),
    {
      get x() {
        return assert.fail("JSON getter executed");
      },
    },
    Object.assign([1], { extra: "ignored by JSON.stringify" }),
  ])
    invalid(() => canonicalJson(value));
});

test("canonical JSON measures exact UTF-8 bytes, container bounds and depth", () => {
  assert.equal(new TextEncoder().encode(canonicalJson("a".repeat(65534))).byteLength, 65536);
  invalid(() => canonicalJson("a".repeat(65535)));
  invalid(() => canonicalJson("\u4e2d".repeat(22000)));
  assert.equal(JSON.parse(canonicalJson(Array(2000).fill(0))).length, 2000);
  invalid(() => canonicalJson(Array(2001).fill(0)));
  invalid(() =>
    canonicalJson(Object.fromEntries(Array.from({ length: 2001 }, (_, index) => [`k${index}`, 0]))),
  );
  const nested = (depth) => {
    let value = 0;
    while (depth--) value = { value };
    return value;
  };
  canonicalJson(nested(20));
  invalid(() => canonicalJson(nested(21)));
});

test("receipt normalization validates full binding and detaches mutable result", () => {
  assert.deepEqual(parseReceiptBinding(binding), binding);
  assert.equal(
    parseReceiptBinding({ ...binding, principal: "fixture-\u{1f600}" }).principal,
    "fixture-\u{1f600}",
  );
  const result = { values: [1, 2] };
  const parsed = parseReceiptInput({ ...binding, result });
  result.values.push(3);
  assert.deepEqual(parsed.result, { values: [1, 2] });
  assert.equal(Object.isFrozen(parsed.result.values), true);
  for (const changed of [
    { scope: { level: "book", tenantId: "T1", bookId: "B1" } },
    { operation: "Wrong" },
    { operation: "ok\n" },
    { key: "" },
    { key: "x\n" },
    { key: "x".repeat(101) },
    { principal: "user\u0000" },
    { principal: "x".repeat(256) },
    { principal: "\ud800" },
    { fingerprint: "A".repeat(64) },
    { fingerprint: "a".repeat(63) },
  ])
    invalid(
      () => parseReceiptBinding({ ...binding, ...changed }),
      changed.scope ? "INVALID_SCOPE" : "INVALID_INPUT",
    );
  invalid(() => parseReceiptInput({ ...binding, result: 1n }));
});

test("audit context remains company-bound with immutable details", () => {
  const input = {
    scope: company,
    operation: "adapter.contract",
    reference: "fixture-1",
    principal: "fixture-user",
    details: { values: [1] },
  };
  const output = parseAuditInput(input);
  input.details.values.push(2);
  assert.deepEqual(output.details, { values: [1] });
  invalid(
    () => parseAuditInput({ ...input, scope: { level: "tenant", tenantId: "T1" } }),
    "INVALID_SCOPE",
  );
  invalid(() => parseAuditInput({ ...input, operation: "BAD" }));
  invalid(() => parseAuditInput({ ...input, details: 1n }));
});

test("audit pagination has one explicit safe bound for both storage dialects", () => {
  const parsed = parseAuditQuery({ scope: company, afterSequence: 0n, limit: 100 });
  assert.deepEqual(parsed, { scope: company, afterSequence: 0, limit: 100 });
  assert.equal(Object.isFrozen(parsed.scope), true);
  for (const limit of [undefined, null, 0, 101, 1.5, "1"]) {
    invalid(() => parseAuditQuery({ scope: company, afterSequence: 0, limit }));
  }
  invalid(() => parseAuditQuery({ scope: company, afterSequence: -1, limit: 1 }));
  invalid(() => parseAuditQuery({ scope: company, afterSequence: 9007199254740992n, limit: 1 }));
  invalid(() => parseAuditQuery({ scope: company, afterSequence: 0, limit: 1, extra: true }));
});

test("scope fields are read from descriptor snapshots rather than host Proxy get traps", () => {
  const value = new Proxy(company, {
    get() {
      assert.fail("Proxy property get executed");
    },
  });
  assert.deepEqual(parseScope(value), company);
});

test("technical revisions preserve bigint exactness and refuse unsafe increment", () => {
  assert.equal(checkedRevision(0n), 0);
  assert.equal(checkedRevision(BigInt(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  assert.equal(nextRevision(Number.MAX_SAFE_INTEGER - 1), Number.MAX_SAFE_INTEGER);
  for (const value of [-1, -1n, 0.1, NaN, Infinity, "1", 9007199254740992n]) {
    invalid(() => checkedRevision(value));
  }
  invalid(() => nextRevision(Number.MAX_SAFE_INTEGER), "OVERFLOW");
});

test("immutable JSON does not retain caller aliases", () => {
  const source = { nested: [{ value: 1 }] };
  const normalized = immutableJson(source);
  source.nested[0].value = 2;
  assert.deepEqual(normalized, { nested: [{ value: 1 }] });
  assert.equal(Object.isFrozen(normalized.nested[0]), true);
});
