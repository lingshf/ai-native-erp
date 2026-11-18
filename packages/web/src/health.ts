import { useEffect, useState } from "react";
import { errorSchema, healthSchema, type HealthResponse } from "@erp/core/contracts";

export type HealthState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly health: HealthResponse }
  | { readonly kind: "networkError" | "invalidResponse" }
  | { readonly kind: "httpError"; readonly status: number };

export function useHealth(attempt: number): HealthState {
  const [state, setState] = useState<HealthState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const update = (next: HealthState) => {
      if (active) setState(next);
    };
    setState({ kind: "loading" });
    void (async () => {
      let response: Response;
      try {
        response = await fetch("/api/v1/health", { signal: controller.signal });
      } catch {
        update({ kind: "networkError" });
        return;
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        update({ kind: "invalidResponse" });
        return;
      }
      if (!response.ok) {
        update(
          errorSchema.safeParse(body).success
            ? { kind: "httpError", status: response.status }
            : { kind: "invalidResponse" },
        );
        return;
      }
      const parsed = healthSchema.safeParse(body);
      update(parsed.success ? { kind: "ready", health: parsed.data } : { kind: "invalidResponse" });
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  return state;
}
