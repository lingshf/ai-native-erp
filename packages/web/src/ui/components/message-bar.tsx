import type { ReactNode } from "react";
import "../../theme/message-bar.css";

// Split from index.tsx so the shell can import it statically without folding the rest of the shared
// components (and components.css) into the entry (D39).

export type Tone = "info" | "success" | "warning" | "danger";
export const symbols: Readonly<Record<Tone, string>> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "×",
};

/** Errors keep role="alert"; other tones pass the role they already had (if any). */
export function MessageBar({
  tone,
  role,
  labelledBy,
  children,
}: {
  tone: Tone;
  role?: "alert" | "status";
  labelledBy?: string;
  children: ReactNode;
}) {
  // aria-labelledby only together with a role that supports a name (a plain div does not).
  const semantics = role && { role, "aria-labelledby": labelledBy };
  return (
    <div className={`message-bar ${tone}`} {...semantics}>
      <span className="icon" aria-hidden="true">
        {symbols[tone]}
      </span>
      <div className="text">{children}</div>
    </div>
  );
}
