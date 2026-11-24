import type {
  TradeAccountRole,
  TradeCalculation,
  TradeConfig,
  TradeInvoiceCommand,
  TradeSide,
} from "@erp/core/domain";
import { invoiceTaxPosting, type InvoiceResolvedLine } from "./trade-invoice-calculation.ts";

export interface InvoiceAccountUse {
  readonly code: string;
  readonly role: TradeAccountRole;
  readonly side?: TradeSide;
  readonly path: string;
}

/** Accounts to re-check, in order: the control account, then each line's account and posted tax account. */
export function invoiceAccountRoleInputs(
  command: TradeInvoiceCommand,
  profile: TradeConfig<"tradeProfile">,
  resolved: readonly InvoiceResolvedLine[],
  calculation: TradeCalculation,
): InvoiceAccountUse[] {
  return [
    {
      code: profile.data.controlAccount,
      role: "controlAccount",
      side: command.side,
      path: "party",
    },
    ...resolved.flatMap(({ account, tax }, index): InvoiceAccountUse[] => {
      const taxPosting = invoiceTaxPosting(command, calculation.lines[index], tax);
      return [
        {
          code: account,
          role: (command.side === "AP" ? "expenseAccount" : "revenueAccount") as TradeAccountRole,
          path: `lines.${index}.product`,
        },
        ...(taxPosting.minor > 0 && taxPosting.account !== null
          ? [
              {
                code: taxPosting.account,
                role: (command.side === "AP"
                  ? "inputAccount"
                  : "outputAccount") as TradeAccountRole,
                path: `lines.${index}.taxCode`,
              },
            ]
          : []),
      ];
    }),
  ];
}
