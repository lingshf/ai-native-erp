import type { Language } from "../ui/index.ts";
import { Modal } from "../journals/dialogs.tsx";
import { BusinessError } from "./business-error.tsx";
import { BusinessPlan } from "./business-plan.tsx";
import { confirm, confirmWithdraw } from "./event-commands.ts";
import type { T } from "./types.ts";
import type { CompanyEventsState, Review, Withdrawal } from "./use-company-events.ts";
/** Maximum length of a transfer-queue withdrawal reason. */
export const WITHDRAW_REASON_MAX_LENGTH = 200;
type ReviewProps = {
  review: Review;
  state: CompanyEventsState;
  language: Language;
  t: T;
};
export function ReviewDialog({ review, state, language, t }: ReviewProps) {
  const { company, busy, uncertain, error, setReview } = state;
  return (
    <Modal title={t("journal.previewTitle")} busy={busy || uncertain} close={() => setReview(null)}>
      <BusinessPlan preview={review.preview} company={company} language={language} t={t} />
      {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
      <div className="ui-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void confirm(state)}
        >
          {t("event" in review ? "business.confirm" : "business.transfer")}
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={busy || uncertain}
          onClick={() => setReview(null)}
        >
          {t("journal.back")}
        </button>
      </div>
    </Modal>
  );
}
type WithdrawProps = { withdraw: Withdrawal; state: CompanyEventsState; t: T };
export function WithdrawDialog({ withdraw, state, t }: WithdrawProps) {
  const { busy, uncertain, error, setWithdraw } = state;
  return (
    <Modal title={t("business.withdraw")} busy={busy || uncertain} close={() => setWithdraw(null)}>
      <label className="ui-field">
        <span className="label">{t("business.reason")}</span>
        <textarea
          required
          maxLength={WITHDRAW_REASON_MAX_LENGTH}
          disabled={busy || uncertain}
          value={withdraw.reason}
          onChange={(event) => setWithdraw({ ...withdraw, reason: event.target.value })}
        />
      </label>
      {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
      <div className="ui-form-actions">
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || !withdraw.reason.trim()}
          onClick={() => void confirmWithdraw(state, withdraw)}
        >
          {t("business.withdrawConfirm")}
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={busy || uncertain}
          onClick={() => setWithdraw(null)}
        >
          {t("journal.back")}
        </button>
      </div>
    </Modal>
  );
}
