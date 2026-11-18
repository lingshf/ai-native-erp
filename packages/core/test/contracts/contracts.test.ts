import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  healthSchema,
  errorSchema,
  openApiDocument,
  verifyOpenApi,
} from "../../src/contracts/index.ts";

const health = {
  service: "ai-native-erp",
  contractVersion: "1",
  profile: "local",
  data: "unconfigured",
};
const error = {
  code: "INVALID_REQUEST",
  messageKey: "error.invalidRequest",
  params: {},
  fieldErrors: [],
  requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
  retryable: false,
};

test("health contract accepts the real Local shell state and rejects invented profiles or extra fields", () => {
  assert.deepEqual(healthSchema.parse(health), health);
  for (const invalid of [
    { ...health, profile: "server" },
    { ...health, data: "ready" },
    { ...health, contractVersion: "2" },
    { ...health, path: "unexpected" },
  ]) {
    assert.equal(healthSchema.safeParse(invalid).success, false);
  }
});

test("all error fields are strictly typed and unknown framework or diagnostic content is rejected", () => {
  assert.deepEqual(errorSchema.parse(error), error);
  for (const invalid of [
    { ...error, stack: "unexpected" },
    { ...error, requestId: "client-provided" },
    { ...error, code: "ARBITRARY_FRAMEWORK_ERROR" },
    { ...error, retryable: "false" },
    { ...error, fieldErrors: [{ path: "amount", messageKey: "error.amount", internal: "extra" }] },
  ]) {
    assert.equal(errorSchema.safeParse(invalid).success, false);
  }
  assert.equal(
    errorSchema.safeParse({ statusCode: 500, error: "Internal", message: "framework-default" })
      .success,
    false,
  );
});

test("on-demand OpenAPI artifact exactly matches every generated DTO and rejects deliberate drift", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "erp-openapi-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true }));
  const output = join(directory, "openapi.json");
  execFileSync(process.execPath, [
    fileURLToPath(new URL("../../generate-openapi.mjs", import.meta.url)),
    output,
  ]);
  const emitted = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(emitted, openApiDocument);
  verifyOpenApi(emitted);
  for (const alter of [
    (doc) => {
      doc.components.schemas.HealthResponse.required.pop();
    },
    (doc) => {
      doc.components.schemas.ErrorResponse.additionalProperties = true;
    },
    (doc) => {
      doc.paths["/api/v1/health"].get.responses["500"] = {};
    },
  ]) {
    const changed = structuredClone(emitted);
    alter(changed);
    assert.throws(() => verifyOpenApi(changed), /OpenAPI/);
  }
  assert.equal(emitted.openapi, "3.1.0");
  for (const name of [
    "Company",
    "Account",
    "Period",
    "ErrorResponse",
    "HealthResponse",
    "LegacyContextResponse",
    "LegacyLedgerResponse",
    "LegacyTrialResponse",
  ]) {
    assert.ok(emitted.components.schemas[name]);
  }
});
