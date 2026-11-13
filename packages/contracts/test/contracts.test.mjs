import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { healthSchema, errorSchema, openApiDocument, verifyOpenApi } from '../dist/index.js';

const health = { service: 'ai-native-erp', contractVersion: '1', profile: 'local', data: 'unconfigured' };
const error = { code: 'INVALID_REQUEST', messageKey: 'error.invalidRequest', params: {}, fieldErrors: [],
  requestId: '4bf203b5-e54f-434c-9100-969da1cd7e73', retryable: false };

test('health contract accepts the real Local shell state and rejects invented profiles or extra fields', () => {
  assert.deepEqual(healthSchema.parse(health), health);
  for (const invalid of [{ ...health, profile: 'server' }, { ...health, data: 'ready' },
    { ...health, contractVersion: '2' }, { ...health, path: 'unexpected' }]) {
    assert.equal(healthSchema.safeParse(invalid).success, false);
  }
});

test('all error fields are strictly typed and unknown framework or diagnostic content is rejected', () => {
  assert.deepEqual(errorSchema.parse(error), error);
  for (const invalid of [{ ...error, stack: 'unexpected' }, { ...error, requestId: 'client-provided' },
    { ...error, code: 'ARBITRARY_FRAMEWORK_ERROR' }, { ...error, retryable: 'false' },
    { ...error, fieldErrors: [{ path: 'amount', messageKey: 'error.amount', internal: 'extra' }] }]) {
    assert.equal(errorSchema.safeParse(invalid).success, false);
  }
  assert.equal(errorSchema.safeParse({ statusCode: 500, error: 'Internal', message: 'framework-default' }).success, false);
});

test('static OpenAPI artifact exactly matches every generated DTO and rejects deliberate drift', () => {
  const emitted = JSON.parse(readFileSync(new URL('../dist/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(emitted, openApiDocument);
  verifyOpenApi(emitted);
  for (const alter of [
    doc => { doc.components.schemas.HealthResponse.required.pop(); },
    doc => { doc.components.schemas.ErrorResponse.additionalProperties = true; },
    doc => { doc.paths['/api/v1/health'].get.responses['500'] = {}; },
  ]) {
    const changed = structuredClone(emitted);
    alter(changed);
    assert.throws(() => verifyOpenApi(changed), /OpenAPI/);
  }
  assert.equal(emitted.openapi, '3.1.0');
  assert.deepEqual(Object.keys(emitted.components.schemas).sort(), [
    'ErrorResponse', 'HealthResponse', 'LegacyContextResponse', 'LegacyLedgerResponse', 'LegacyTrialResponse',
  ]);
});
