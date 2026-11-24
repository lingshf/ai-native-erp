import type { CompanyDto, PeriodDto, ClosePreviewDto, CloseResultDto } from "@erp/core/contracts";
import type { CloseText } from "./close-text.ts";
import type { CloseCommands } from "./use-close-commands.ts";

type ActionProps = {
  t: CloseText;
  company: CompanyDto;
  working: boolean;
  execute: CloseCommands["execute"];
};

export function CloseActionBar({
  t,
  company,
  period,
  latestPeriod,
  working,
  closedView,
  commands,
}: {
  t: CloseText;
  company: CompanyDto;
  period: PeriodDto;
  latestPeriod: PeriodDto;
  working: boolean;
  closedView: CloseResultDto | boolean;
  commands: CloseCommands;
}) {
  const { result, preview, pending, busy, execute } = commands;
  return (
    <div className="bar">
      {latestPeriod.status !== "closed" && !result && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={working}
          onClick={() => void commands.loadPreview()}
        >
          {t("close.preview")}
        </button>
      )}
      {preview && (
        <ConfirmCloseButton
          t={t}
          company={company}
          working={working}
          execute={execute}
          preview={preview}
        />
      )}
      {closedView && (
        <OpenNextButton
          t={t}
          company={company}
          working={working}
          execute={execute}
          period={period}
          latestPeriod={latestPeriod}
        />
      )}
      {pending && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void execute(pending)}
        >
          {t("close.retry")}
        </button>
      )}
      <span>
        {period.month} · {t(`close.status.${latestPeriod.status}`)}
      </span>
    </div>
  );
}

function ConfirmCloseButton({
  t,
  company,
  working,
  execute,
  preview,
}: ActionProps & { preview: ClosePreviewDto }) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={working || preview.blockers.length > 0}
      onClick={() =>
        void execute({
          action: "close",
          body: {
            company: company.code,
            revision: preview.revision,
            commandId: preview.commandId,
            fingerprint: preview.fingerprint,
            confirmation: "CLOSE",
          },
        })
      }
    >
      {t("close.confirm")}
    </button>
  );
}

function OpenNextButton({
  t,
  company,
  working,
  execute,
  period,
  latestPeriod,
}: ActionProps & { period: PeriodDto; latestPeriod: PeriodDto }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={
        working ||
        ((company.closeMode === "monthly-teaching" || period.month.endsWith("-12")) &&
          latestPeriod.status !== "closed")
      }
      onClick={() =>
        void execute({
          action: "open-next",
          body: { company: company.code, revision: latestPeriod.revision },
        })
      }
    >
      {t("close.next")}
    </button>
  );
}
