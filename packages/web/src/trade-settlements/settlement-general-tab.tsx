import type { TradeSettlementCommandDto } from "@erp/core/contracts";
import { FastTab } from "../ui/components/index.tsx";
import type { T } from "./settlement-model.ts";

type SettlementGeneralTabProps = {
  t: T;
  command: TradeSettlementCommandDto;
  locked: boolean;
  onChange: (next: TradeSettlementCommandDto) => void;
};

export function SettlementGeneralTab({ t, command, locked, onChange }: SettlementGeneralTabProps) {
  return (
    <FastTab id="tset-general" title={t("master.general")}>
      <fieldset disabled={locked} className="ui-form-grid">
        <div className="ui-field">
          <label htmlFor="tset-side">{t("trade.side")}</label>
          <select
            id="tset-side"
            value={command.side}
            onChange={(e) =>
              onChange({ ...command, side: e.target.value === "AR" ? "AR" : "AP", items: [] })
            }
          >
            <option value="AP">{t("trade.AP")}</option>
            <option value="AR">{t("trade.AR")}</option>
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="tset-party">{t("tinv.party")}</label>
          <input
            id="tset-party"
            value={command.party}
            onChange={(e) => onChange({ ...command, party: e.target.value, items: [] })}
          />
        </div>
        {(["accountingDate", "documentDate", "taxDate"] as const).map((field) => (
          <div key={field} className="ui-field">
            <label htmlFor={`tset-${field}`}>{t(`tinv.${field}`)}</label>
            <input
              id={`tset-${field}`}
              type="date"
              value={command[field]}
              onChange={(e) => onChange({ ...command, [field]: e.target.value })}
            />
          </div>
        ))}
      </fieldset>
    </FastTab>
  );
}
