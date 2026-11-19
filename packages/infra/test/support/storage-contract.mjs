import { test } from "vitest";
import assert from "node:assert/strict";

export const scope = Object.freeze({
  level: "company",
  tenantId: "T1",
  bookId: "B1",
  companyId: "C1",
});
export const plan = Object.freeze({ level: "company", scopes: [scope] });
export const receipt = Object.freeze({
  scope,
  operation: "adapter.contract",
  key: "one",
  principal: "contract-user",
  fingerprint: "a".repeat(64),
  result: { z: null, a: [true, 1] },
});

export function storageContract(create) {
  test("explicit migration, provisioning, immutable receipt, CAS and rollback", async () => {
    const storage = await create();
    try {
      await assert.rejects(storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
      await storage.migrate();
      await storage.migrate();
      await storage.verifySchema();
      await storage.provision(scope);
      await storage.provision(scope);
      await storage.write(plan, async (session) => {
        assert.equal(session.level, "company");
        assert.equal(await session.revisions.get(scope), 0);
        assert.equal(await session.revisions.advance(scope, 0), 1);
        assert.deepEqual((await session.receipts.save(receipt)).result, receipt.result);
        assert.deepEqual(
          await session.receipts.save(receipt),
          await session.receipts.get(receiptBinding()),
        );
        assert.equal(
          (
            await session.audit.append({
              scope,
              operation: "adapter.contract",
              reference: "one",
              principal: "contract-user",
              details: { ok: true },
            })
          ).sequence,
          1,
        );
      });
      await assert.rejects(
        storage.write(plan, async (session) => {
          await session.revisions.advance(scope, 1);
          throw new Error("rollback fixture");
        }),
      );
      await storage.read(scope, async (session) => {
        assert.equal(await session.revisions.get(scope), 1);
        assert.equal((await session.audit.list({ scope, afterSequence: 0, limit: 100 })).length, 1);
      });
      await assert.rejects(
        storage.write(plan, async (session) => {
          await assert.rejects(session.receipts.save({ ...receipt, principal: "other" }), {
            code: "CONFLICT",
          });
          await session.revisions.advance(scope, 1);
        }),
        { code: "CONFLICT" },
      );
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 1);
    } finally {
      await storage.close();
    }
    await assert.rejects(
      storage.read(scope, () => undefined),
      { code: "CLOSED" },
    );
  });
}

export function receiptBinding() {
  const { result: _result, ...binding } = receipt;
  return binding;
}

export function barrier() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function initialized(create, transactionTimeoutMs) {
  const storage = await create(transactionTimeoutMs);
  await storage.migrate();
  await storage.provision(scope);
  return storage;
}

export function extendedContract(create) {
  test("revision, receipt and audit failures each roll back all earlier repository effects", async () => {
    const storage = await initialized(create);
    try {
      for (const fail of ["revision", "receipt", "audit"]) {
        await assert.rejects(
          storage.write(plan, async (s) => {
            await s.receipts.save({ ...receipt, key: fail });
            await s.audit.append({
              scope,
              operation: receipt.operation,
              reference: fail,
              principal: receipt.principal,
              details: { fail },
            });
            if (fail === "revision") await s.revisions.advance(scope, 7);
            else {
              await s.revisions.advance(scope, 0);
              if (fail === "receipt")
                await s.receipts.save({ ...receipt, key: fail, fingerprint: "b".repeat(64) });
              else
                await s.audit.append({
                  scope,
                  operation: receipt.operation,
                  reference: fail,
                  principal: "\0",
                  details: null,
                });
            }
          }),
          { code: fail === "audit" ? "INVALID_INPUT" : "CONFLICT" },
        );
        await storage.read(scope, async (s) => {
          assert.equal(await s.revisions.get(scope), 0);
          assert.equal(await s.receipts.get({ ...receiptBinding(), key: fail }), null);
          assert.deepEqual(await s.audit.list({ scope, afterSequence: 0, limit: 100 }), []);
        });
      }
    } finally {
      await storage.close();
    }
  });

  test("graded scopes and runtime exact preplanned membership, not TS authorization", async () => {
    const storage = await initialized(create);
    try {
      const other = { ...scope, companyId: "C2" };
      await storage.provision(other);
      for (const tier of [
        { level: "tenant", tenantId: scope.tenantId },
        { level: "book", tenantId: scope.tenantId, bookId: scope.bookId },
      ]) {
        await storage.write({ level: tier.level, scopes: [tier] }, async (s) => {
          assert.equal(s.receipts, undefined);
          assert.equal(s.audit, undefined);
          assert.equal(await s.revisions.advance(tier, 0), 1);
        });
      }
      for (const forged of [
        other,
        { level: "tenant", tenantId: "T1" },
        { ...scope, bookId: "B2" },
        { ...scope, tenantId: "T2" },
        { ...scope, fiscalYear: 2026 },
      ]) {
        await assert.rejects(
          storage.write(plan, async (s) => {
            await assert.rejects(s.revisions.get(forged), { code: "INVALID_SCOPE" });
          }),
          { code: "INVALID_SCOPE" },
        );
      }
      await assert.rejects(
        storage.read(scope, async (s) => {
          await s.receipts.get({ ...receiptBinding(), scope: other });
        }),
        { code: "INVALID_SCOPE" },
      );
      for (const bad of [
        { ...scope, companyId: "" },
        { ...scope, companyId: "lower" },
        { ...scope, companyId: "非ASCII" },
        { ...scope, companyId: "_C1" },
        { ...scope, companyId: "C".repeat(61) },
      ]) {
        await assert.rejects(storage.provision(bad), { code: "INVALID_SCOPE" });
      }
      await assert.rejects(
        storage.write({ level: "company", scopes: [scope, scope] }, () => {}),
        { code: "INVALID_SCOPE" },
      );
      await assert.rejects(
        storage.write({ level: "company", scopes: [] }, () => {}),
        { code: "INVALID_SCOPE" },
      );
      await storage.provision({ ...scope, companyId: "C".repeat(60) });
      await assert.rejects(
        storage.write({ level: "company", scopes: [{ ...scope, companyId: "MISSING" }] }, () =>
          assert.fail("business transaction provisioned an absent scope"),
        ),
        { code: "NOT_FOUND" },
      );
      await assert.rejects(
        storage.write(plan, (s) => s.revisions.advance(scope, Number.MAX_SAFE_INTEGER)),
        { code: "OVERFLOW" },
      );
      await assert.rejects(
        storage.write(plan, (s) => s.revisions.advance(scope, 1)),
        { code: "CONFLICT" },
      );
    } finally {
      await storage.close();
    }
  });

  test("nested calls, stale sessions and caught failures cannot commit", async () => {
    const storage = await initialized(create);
    let stale;
    try {
      await storage.write(plan, async (s) => {
        stale = s;
        await assert.rejects(
          storage.read(scope, () => undefined),
          { code: "NESTED_UOW" },
        );
        await assert.rejects(
          storage.write(plan, () => undefined),
          { code: "NESTED_UOW" },
        );
        await assert.rejects(storage.close(), { code: "NESTED_UOW" });
      });
      await assert.rejects(stale.revisions.get(scope), { code: "CLOSED" });
      await assert.rejects(
        storage.read(scope, async () => {
          await storage.write(plan, () => undefined);
        }),
        { code: "NESTED_UOW" },
      );
      await assert.rejects(
        storage.write(plan, async (s) => {
          await s.revisions.advance(scope, 0);
          await assert.rejects(s.audit.list({ scope, afterSequence: 0, limit: 101 }), {
            code: "INVALID_INPUT",
          });
        }),
        { code: "INVALID_INPUT" },
      );
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 0);
      await assert.rejects(
        storage.write(plan, (s) => {
          void s.receipts.save(receipt);
          void s.revisions.advance(scope, 0);
        }),
        { code: "PENDING_OPERATIONS" },
      );
      assert.equal(await storage.read(scope, (s) => s.receipts.get(receiptBinding())), null);
    } finally {
      await storage.close();
    }
  });

  test("canonical JSON, receipt identity, audit scope and bounded query validation", async () => {
    const storage = await initialized(create);
    try {
      await storage.write(plan, async (s) => {
        const first = await s.receipts.save(receipt);
        assert.deepEqual(
          first,
          await s.receipts.save({ ...receipt, result: { a: [true, 1], z: null } }),
        );
        assert.equal(Object.isFrozen(first.result), true);
        assert.deepEqual(
          (
            await s.receipts.save({
              ...receipt,
              key: "safe-limit",
              result: { safe: Number.MAX_SAFE_INTEGER },
            })
          ).result,
          { safe: Number.MAX_SAFE_INTEGER },
        );
        assert.equal(
          (await s.receipts.save({ ...receipt, key: "json-bytes", result: "x".repeat(65534) }))
            .result.length,
          65534,
        );
        const depth20 = Array.from({ length: 20 }).reduce((value) => [value], null);
        await s.receipts.save({ ...receipt, key: "json-depth", result: depth20 });
        for (let i = 0; i < 3; i++)
          await s.audit.append({
            scope,
            operation: receipt.operation,
            reference: `audit-${i}`,
            principal: receipt.principal,
            details: { i },
          });
        assert.deepEqual(
          (await s.audit.list({ scope, afterSequence: 1, limit: 1 })).map((row) => row.sequence),
          [2],
        );
      });
      for (const change of [{ principal: "other" }, { fingerprint: "b".repeat(64) }]) {
        await assert.rejects(
          storage.write(plan, (s) => s.receipts.get({ ...receiptBinding(), ...change })),
          { code: "CONFLICT" },
        );
      }
      const cycle = {};
      cycle.self = cycle;
      const depth21 = Array.from({ length: 21 }).reduce((value) => [value], null);
      for (const result of [
        1n,
        1.5,
        NaN,
        Infinity,
        cycle,
        new Date(),
        { constructor: "bad" },
        "x".repeat(65535),
        depth21,
        Array(2001).fill(null),
        Object.create({ inherited: true }),
      ]) {
        await assert.rejects(
          storage.write(plan, (s) => s.receipts.save({ ...receipt, key: "invalid", result })),
          { code: "INVALID_INPUT" },
        );
      }
      for (const query of [
        { scope, afterSequence: -1, limit: 1 },
        { scope, afterSequence: 0, limit: 0 },
        { scope, afterSequence: Number.MAX_SAFE_INTEGER + 1, limit: 1 },
        { scope, afterSequence: 0, limit: 1.5 },
        { scope, afterSequence: 0, limit: 1, extra: true },
      ]) {
        await assert.rejects(
          storage.read(scope, (s) => s.audit.list(query)),
          { code: "INVALID_INPUT" },
        );
      }
      assert.equal(
        (await storage.read(scope, (s) => s.audit.list({ scope, afterSequence: 0, limit: 100 })))
          .length,
        3,
      );
    } finally {
      await storage.close();
    }
  });

  test("callback failures expose stable codes, never raw request/SQL/connection details", async () => {
    const storage = await initialized(create);
    try {
      await assert.rejects(
        storage.write(plan, () => {
          throw new Error("private-request SQL connection-string sentinel");
        }),
        (error) => {
          assert.equal(error.code, "STORAGE_FAILURE");
          assert.equal(error.message, "The storage operation failed.");
          assert.equal(error.cause, undefined);
          assert.ok(!JSON.stringify(error).includes("sentinel"));
          assert.ok(!String(error).includes("sentinel"));
          return true;
        },
      );
    } finally {
      await storage.close();
    }
  });

  test("concurrent scope provision and receipt contenders have one exact result", async () => {
    const storage = await initialized(create);
    try {
      await Promise.all(Array.from({ length: 4 }, () => storage.provision(scope)));
      const results = await Promise.all(
        Array.from({ length: 4 }, () => storage.write(plan, (s) => s.receipts.save(receipt))),
      );
      assert.deepEqual(results, Array(4).fill(results[0]));
      const raced = await Promise.allSettled([
        storage.write(plan, (s) => s.receipts.save({ ...receipt, key: "race", principal: "one" })),
        storage.write(plan, (s) => s.receipts.save({ ...receipt, key: "race", principal: "two" })),
      ]);
      assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(raced.find((r) => r.status === "rejected").reason.code, "CONFLICT");
    } finally {
      await storage.close();
    }
  });

  test("consistent snapshot spans await while independent writer commits", async () => {
    const storage = await initialized(create);
    const entered = barrier();
    const resume = barrier();
    try {
      const read = storage.read(scope, async (s) => {
        assert.equal(await s.revisions.get(scope), 0);
        entered.release();
        await resume.promise;
        assert.equal(await s.revisions.get(scope), 0);
      });
      await entered.promise;
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
      resume.release();
      await read;
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 1);
    } finally {
      resume.release();
      await storage.close();
    }
  });

  test("same-scope writers serialized for complete callbacks across await", async () => {
    const storage = await initialized(create);
    const entered = barrier();
    const resume = barrier();
    const secondEntered = barrier();
    let secondStarted = false;
    try {
      const first = storage.write(plan, async (s) => {
        await s.revisions.advance(scope, 0);
        entered.release();
        await resume.promise;
        assert.equal(secondStarted, false);
      });
      await entered.promise;
      const second = storage.write(plan, async (s) => {
        secondStarted = true;
        secondEntered.release();
        assert.equal(await s.revisions.get(scope), 1);
        await s.revisions.advance(scope, 1);
      });
      // No wall-clock race: second cannot cross the first transaction's barrier.
      resume.release();
      await Promise.all([first, second]);
      await secondEntered.promise;
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 2);
    } finally {
      resume.release();
      await storage.close();
    }
  });

  test("close drains admitted transaction, rejects newcomers and is idempotent", async () => {
    const storage = await initialized(create);
    const entered = barrier();
    const resume = barrier();
    const running = storage.write(plan, async (s) => {
      entered.release();
      await resume.promise;
      return s.revisions.advance(scope, 0);
    });
    await entered.promise;
    const closing = storage.close();
    await assert.rejects(
      storage.write(plan, () => undefined),
      { code: "CLOSED" },
    );
    resume.release();
    assert.equal(await running, 1);
    await closing;
    await storage.close();
  });

  test("hung writer rolls back inserted data, next writer healthy, late writer session dead", async () => {
    const storage = await initialized(create, 200);
    const entered = barrier();
    const late = barrier();
    let stale;
    const hanging = storage.write(plan, async (s) => {
      stale = s;
      await s.receipts.save(receipt);
      await s.revisions.advance(scope, 0);
      entered.release();
      await late.promise;
    });
    const outcome = assert.rejects(hanging, { code: "TRANSACTION_TIMEOUT" });
    try {
      await Promise.race([
        entered.promise,
        outcome.then(() => assert.fail("Writer expired before its callback started.")),
      ]);
      await outcome;
      await storage.read(scope, async (s) => {
        assert.equal(await s.revisions.get(scope), 0);
        assert.equal(await s.receipts.get(receiptBinding()), null);
      });
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
      await assert.rejects(stale.receipts.save(receipt), { code: "CLOSED" });
      await assert.rejects(stale.revisions.advance(scope, 1), { code: "CLOSED" });
    } finally {
      late.release();
      await storage.close();
    }
  });

  test("hung callback expires without blocking close on unrelated external promise", async () => {
    const storage = await initialized(create, 200);
    const entered = barrier();
    const late = barrier();
    let stale;
    const hanging = storage.read(scope, async (s) => {
      stale = s;
      entered.release();
      await late.promise;
    });
    const outcome = assert.rejects(hanging, { code: "TRANSACTION_TIMEOUT" });
    try {
      await Promise.race([
        entered.promise,
        outcome.then(() => assert.fail("Reader expired before its callback started.")),
      ]);
      await Promise.all([outcome, storage.close()]);
      await assert.rejects(stale.revisions.get(scope), { code: "CLOSED" });
    } finally {
      late.release();
      await storage.close();
    }
  });
}
