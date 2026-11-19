import type { ReactNode } from "react";
import type { Language } from "../labels.ts";
import "../../theme/components.css";

// UI-1 shared components (design/ui/README.md §5, §6): thin wrappers that only add layout classes.
// Children keep their own IDs, names and events.

// design/ui §6: tip title per language; the decorative mark is aria-hidden.
const teachingNote: Readonly<Record<Language, string>> = { zh: "教学说明", en: "Teaching note" };

export function PageHeader({
  title,
  description,
  context,
}: {
  title: ReactNode;
  description?: ReactNode;
  context?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="titles">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {context && <div className="context">{context}</div>}
    </div>
  );
}

/** Not rendered at all when teaching is off (PG-04: boundaries, risks and errors live elsewhere). */
export function TeachingTip({
  teaching,
  language,
  children,
}: {
  teaching: boolean;
  language: Language;
  children: ReactNode;
}) {
  if (!teaching) return null;
  const title = teachingNote[language];
  return (
    <aside className="teaching-tip" aria-label={title}>
      <span className="mark" aria-hidden="true">
        {title[0]}
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  );
}

export type Tone = "info" | "success" | "warning" | "danger";
const symbols: Readonly<Record<Tone, string>> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "×",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      <span aria-hidden="true">{symbols[tone]}</span>
      {children}
    </span>
  );
}

/** Errors keep role="alert"; other tones pass the role they already had (if any). */
export function MessageBar({
  tone,
  role,
  children,
}: {
  tone: Tone;
  role?: "alert" | "status";
  children: ReactNode;
}) {
  return (
    <div className={`message-bar ${tone}`} role={role}>
      <span className="icon" aria-hidden="true">
        {symbols[tone]}
      </span>
      <div className="text">{children}</div>
    </div>
  );
}
