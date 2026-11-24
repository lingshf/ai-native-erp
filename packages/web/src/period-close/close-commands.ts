import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  periodSchema,
  closePreviewSchema,
  closeResultSchema,
  type CompanyDto,
  type PeriodDto,
  type ClosePreviewDto,
  type CloseResultDto,
} from "@erp/core/contracts";
import { MasterDataFailure, masterRequest } from "../master-data-client.ts";

export type Pending =
  | {
      action: "close";
      body: {
        company: string;
        revision: number;
        commandId: string;
        fingerprint: string;
        confirmation: "CLOSE";
      };
    }
  | { action: "open-next"; body: { company: string; revision: number } };

export type CloseScope = {
  company: CompanyDto;
  period: PeriodDto;
  setLocked: (locked: boolean) => void;
  next: (month: string) => void;
};

export type CloseCommandContext = CloseScope & {
  client: QueryClient;
  base: string;
  busy: boolean;
  pending: Pending | null;
  setPreview: Dispatch<SetStateAction<ClosePreviewDto | null>>;
  setResult: Dispatch<SetStateAction<CloseResultDto | null>>;
  setPending: Dispatch<SetStateAction<Pending | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<unknown>>;
};

export async function loadPreview({
  company,
  period,
  setLocked,
  base,
  busy,
  pending,
  setPreview,
  setResult,
  setBusy,
  setError,
}: CloseCommandContext) {
  if (busy || pending) return;
  setLocked(true);
  setBusy(true);
  setError(null);
  setResult(null);
  setPreview(null);
  const body = {
    company: company.code,
    revision: period.revision,
    commandId: crypto.randomUUID(),
  };
  try {
    const current = await masterRequest(`${base}/close-preview`, closePreviewSchema, {
      method: "POST",
      body,
    });
    if (
      current.company !== body.company ||
      current.month !== period.month ||
      current.revision !== body.revision ||
      current.commandId !== body.commandId
    )
      throw new MasterDataFailure("invalid");
    setPreview(current);
  } catch (failure) {
    setError(failure);
  } finally {
    setBusy(false);
  }
}

export async function execute(
  {
    company,
    period,
    setLocked,
    next,
    client,
    base,
    busy,
    setPreview,
    setResult,
    setPending,
    setBusy,
    setError,
  }: CloseCommandContext,
  command: Pending,
) {
  if (busy) return;
  setLocked(true);
  setPending(command);
  setBusy(true);
  setError(null);
  try {
    if (command.action === "close") {
      const closed = await masterRequest(`${base}/close`, closeResultSchema, {
        method: "POST",
        body: command.body,
      });
      if (
        closed.preview.company !== command.body.company ||
        closed.preview.month !== period.month ||
        closed.preview.commandId !== command.body.commandId ||
        closed.preview.fingerprint !== command.body.fingerprint ||
        closed.receipt.idempotencyKey !== command.body.commandId
      )
        throw new MasterDataFailure("invalid");
      setResult(closed);
      setPreview(null);
      setPending(null);
      void client.invalidateQueries({ queryKey: ["ledger-live", company.code] });
      void client.invalidateQueries({ queryKey: ["close-periods", company.code] });
    } else {
      const opened = await masterRequest(`${base}/open-next`, periodSchema, {
        method: "POST",
        body: command.body,
      });
      const year = Number(period.month.slice(0, 4)),
        month = Number(period.month.slice(5));
      const expected =
        month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      if (opened.month !== expected || opened.status !== "open")
        throw new MasterDataFailure("invalid");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["close-periods", company.code] }),
        client.invalidateQueries({ queryKey: ["ledger-periods", company.code] }),
      ]);
      setPending(null);
      next(opened.month);
    }
  } catch (failure) {
    setError(failure);
    if (
      failure instanceof MasterDataFailure &&
      failure.kind === "http" &&
      (failure.status ?? 500) < 500
    ) {
      setPending(null);
      setPreview(null);
      void client.invalidateQueries({ queryKey: ["close-periods", company.code] });
    }
  } finally {
    setBusy(false);
  }
}
