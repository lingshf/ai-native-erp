import { errorSchema, type ContractSchema } from "@erp/core/contracts";

export class MasterDataFailure extends Error {
  readonly kind: "network" | "invalid" | "http";
  readonly status: number | undefined;
  constructor(kind: MasterDataFailure["kind"], status?: number) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}
export async function masterRequest<T>(
  path: string,
  schema: ContractSchema<T>,
  options: { signal?: AbortSignal; body?: unknown; method?: "POST" | "PUT" } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.method
        ? {
            method: options.method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(options.body),
          }
        : {}),
    });
  } catch {
    throw new MasterDataFailure("network");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MasterDataFailure("invalid");
  }
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    if (!error.success || (response.status === 409 && error.data.code !== "CONFLICT"))
      throw new MasterDataFailure("invalid");
    throw new MasterDataFailure("http", response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MasterDataFailure("invalid");
  return parsed.data;
}
