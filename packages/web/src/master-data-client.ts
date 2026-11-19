import { errorSchema, type ContractSchema, type ErrorResponse } from "@erp/core/contracts";

export class MasterDataFailure extends Error {
  readonly kind: "network" | "invalid" | "http";
  readonly status: number | undefined;
  readonly detail: ErrorResponse | undefined;
  constructor(kind: MasterDataFailure["kind"], status?: number, detail?: ErrorResponse) {
    super(kind);
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}
export async function masterRequest<T>(
  path: string,
  schema: ContractSchema<T>,
  options: { signal?: AbortSignal; body?: unknown; method?: "POST" | "PUT" | "DELETE" } = {},
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
    if (
      !error.success ||
      (response.status === 409 &&
        error.data.code !== "CONFLICT" &&
        !(path.startsWith("/api/v1/ai/") && error.data.code === "AI_BUSY"))
    )
      throw new MasterDataFailure("invalid");
    throw new MasterDataFailure("http", response.status, error.data);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MasterDataFailure("invalid");
  return parsed.data;
}
