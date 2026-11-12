import { z } from 'zod';

export const healthSchema = z.strictObject({
  service: z.literal('ai-native-erp'),
  contractVersion: z.literal('1'),
  profile: z.literal('local'),
  data: z.literal('unconfigured'),
});

export const errorCodeSchema = z.enum([
  'INVALID_REQUEST', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'UNSUPPORTED_MEDIA_TYPE', 'UNAVAILABLE', 'INTERNAL_ERROR',
]);

export const errorSchema = z.strictObject({
  code: errorCodeSchema,
  messageKey: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  fieldErrors: z.array(z.strictObject({ path: z.string(), messageKey: z.string().min(1) })),
  requestId: z.uuid(),
  retryable: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthSchema>;
export type ErrorResponse = z.infer<typeof errorSchema>;

const response = (description: string, schema: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'AI Native ERP Local runtime contract', version: '1' },
  paths: {
    '/api/v1/health': {
      get: {
        operationId: 'getRuntimeHealth',
        responses: {
          '200': response('Local runtime; no ledger is opened by this endpoint.', 'HealthResponse'),
          ...Object.fromEntries([400, 404, 405, 415, 500, 503].map(status =>
            [String(status), response('Explicit runtime error.', 'ErrorResponse')])),
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: z.toJSONSchema(healthSchema, { target: 'draft-2020-12' }),
      ErrorResponse: z.toJSONSchema(errorSchema, { target: 'draft-2020-12' }),
    },
  },
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function verifyOpenApi(document: unknown): void {
  if (JSON.stringify(stable(document)) !== JSON.stringify(stable(openApiDocument))) {
    throw new Error('OpenAPI artifact differs from its single-source runtime contracts.');
  }
}
