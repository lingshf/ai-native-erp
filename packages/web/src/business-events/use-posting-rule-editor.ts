import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountsPageSchema,
  postingRulesPageSchema,
  postingRuleSchema,
  type CompanyDto,
  type PostingRuleDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { usePage } from "./list.tsx";

export type PostingRuleEditor = ReturnType<typeof usePostingRuleEditor>;

export function usePostingRuleEditor(company: CompanyDto, lock: (value: boolean) => void) {
  const page = usePage("posting-rules", company.code, postingRulesPageSchema),
    accounts = usePage("accounts", company.code, accountsPageSchema),
    client = useQueryClient();
  const [value, setValue] = useState<PostingRuleDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  const working = useRef(false),
    alive = useRef(true),
    form = useRef<HTMLFormElement>(null),
    editing = value !== null;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    lock(editing || busy);
    return () => lock(false);
  }, [editing, busy, lock]);
  // Same as MasterSettings: refocus in the layout phase on entering edit or after a failed save.
  useLayoutEffect(() => {
    if (editing && !busy)
      form.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
  }, [editing, busy]);
  const start = (rule: PostingRuleDto) => {
    setValue(rule);
    setError(undefined);
    setSaved(false);
  };
  const cancel = () => {
    setValue(null);
    setError(undefined);
  };
  const save = (rule: PostingRuleDto) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(undefined);
    void masterRequest("/api/v1/posting-rules", postingRuleSchema, {
      method: "POST",
      body: { company: company.code, value: rule },
    })
      .then(
        () => {
          if (alive.current) {
            setValue(null);
            setSaved(true);
            void client.invalidateQueries({
              queryKey: ["business", company.code, "posting-rules"],
            });
          }
        },
        (cause) => {
          if (alive.current) setError(cause);
        },
      )
      .finally(() => {
        working.current = false;
        if (alive.current) setBusy(false);
      });
  };
  return {
    page,
    accounts,
    value,
    setValue,
    busy,
    error,
    saved,
    form,
    editing,
    start,
    cancel,
    save,
  };
}
