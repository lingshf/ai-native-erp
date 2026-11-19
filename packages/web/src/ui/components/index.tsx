import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import "../../theme/components.css";

// UI-1 shared components (design/ui/README.md §5, §6): thin wrappers that only add layout classes.
// Children keep their own IDs, names and events.

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

/**
 * Not rendered at all when teaching is off (PG-04: boundaries, risks and errors live elsewhere).
 * `title` comes from the caller's labels; it is both the visible heading and the accessible name.
 */
export function TeachingTip({
  teaching,
  title,
  children,
}: {
  teaching: boolean;
  title: string;
  children: ReactNode;
}) {
  if (!teaching) return null;
  return (
    <aside className="teaching-tip" aria-label={title}>
      <span className="mark" aria-hidden="true">
        {Array.from(title)[0]}
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

function hasAlert(node: HTMLElement | null) {
  return node?.querySelector('[role="alert"]') != null;
}

/**
 * Collapsible card (design/ui §5). The body stays expanded and cannot be collapsed while it contains
 * a role="alert", so errors are never hidden (PG-04).
 */
export function FastTab({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  // Runs after every render of the owner; the observer covers alerts rendered by descendants alone.
  useLayoutEffect(() => {
    if (hasAlert(body.current)) setOpen(true);
  });
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    const observer = new MutationObserver(() => {
      if (hasAlert(node)) setOpen(true);
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role"],
    });
    return () => observer.disconnect();
  }, []);
  const bodyId = `${id}-body`;
  return (
    <div className="fasttab">
      <header>
        <h3>
          <button
            type="button"
            className="fasttab-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(hasAlert(body.current) || !open)}
          >
            {title}
          </button>
        </h3>
        {summary && <span className="summary">{summary}</span>}
      </header>
      <div id={bodyId} className="body" ref={body} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
