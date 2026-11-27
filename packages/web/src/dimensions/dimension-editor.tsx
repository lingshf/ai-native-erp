import {
  type CompanyDto,
  type DimensionDto,
  dimensionConfigSchema,
  dimensionWriteSchema,
} from "@erp/core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { masterRequest } from "../master-data-client.ts";
import { type Draft, initialDraft, parseDraftFields, specific } from "./dimension-draft.ts";
import { DimensionEditorForm } from "./dimension-editor-form.tsx";
import { type Failure, failure } from "./dimension-failure.tsx";
import type { Kind, T } from "./dimension-types.ts";

type EditorProps = {
  company: CompanyDto;
  kind: Kind;
  dimension: string;
  initial: DimensionDto | null;
  t: T;
  close: () => void;
};

export function DimensionEditor({ company, kind, dimension, initial, t, close }: EditorProps) {
  const client = useQueryClient();
  const fields = ["code", "from", "to", ...specific[kind]] as const;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(kind, company, initial));
  const [error, setError] = useState<Failure | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const draftFields = parseDraftFields(fields, draft);
    if ("invalidField" in draftFields) {
      setError({ path: draftFields.invalidField, key: "dim.issue.shape", conflict: false });
      return;
    }
    const raw: Record<string, unknown> = {
      kind,
      revision: initial?.revision ?? 0,
      active: draft.active === "true",
      ...(kind === "value" ? { dimension } : {}),
      ...draftFields.values,
    };
    const parsed = dimensionWriteSchema.safeParse({ company: company.code, config: raw });
    if (!parsed.success) {
      setError({
        path: parsed.error.issues[0]?.path.filter((key) => key !== "config").join(".") || "form",
        key: "dim.issue.shape",
        conflict: false,
      });
      return;
    }
    const id = ++generation.current;
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    let accepted = false;
    try {
      await masterRequest("/api/v1/dimensions", dimensionConfigSchema, {
        method: initial ? "PUT" : "POST",
        body: parsed.data,
        signal: controller.current.signal,
      });
      accepted = true;
      if (generation.current === id) close();
    } catch (issue) {
      if (generation.current === id) setError(failure(issue));
    } finally {
      if (generation.current === id) setBusy(false);
      if (accepted || generation.current !== id)
        void client.invalidateQueries({ queryKey: ["dimensions", company.code] });
    }
  }
  return (
    <DimensionEditorForm
      fields={fields}
      draft={draft}
      setDraft={setDraft}
      error={error}
      busy={busy}
      kind={kind}
      initial={initial}
      t={t}
      close={close}
      onSubmit={(event) => void submit(event)}
      onReload={() => {
        void client.invalidateQueries({ queryKey: ["dimensions", company.code] });
        close();
      }}
    />
  );
}
