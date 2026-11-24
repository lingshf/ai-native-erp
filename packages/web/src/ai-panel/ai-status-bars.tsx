import type { ReactNode } from "react";
import { MasterDataFailure } from "../master-data-client.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./ai-text.ts";

export function AiStatusBar({ children }: { children: ReactNode }) {
  return (
    <MessageBar tone="info" role="status">
      {children}
    </MessageBar>
  );
}

export function AiErrorBar({ t, error }: { t: T; error: unknown }) {
  const reason =
    error instanceof MasterDataFailure ? error.detail?.messageKey.split(".").at(-1) : undefined;
  const errorKey = (
    ["unavailable", "timeout", "cancelled", "busy", "response", "cleanup"] as const
  ).find((item) => item === reason);
  return (
    <MessageBar tone="danger" role="alert">
      {t(errorKey ? `ai.${errorKey}` : "ai.error")}
    </MessageBar>
  );
}
