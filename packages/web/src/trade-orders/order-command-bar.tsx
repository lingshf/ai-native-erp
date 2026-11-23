import type { RefObject } from "react";
import { Badge } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";

type OrderCommandBarProps = {
  t: T;
  working: "save" | "preview" | null;
  busy: boolean;
  dirty: boolean;
  previewed: boolean;
  previewButton: RefObject<HTMLButtonElement | null>;
  onPreview: () => Promise<void>;
  onDiscard: () => void;
};

export function OrderCommandBar(props: OrderCommandBarProps) {
  const { t, working, busy, dirty, previewed, previewButton, onPreview, onDiscard } = props;
  return (
    <div className="tord-command-bar">
      <button
        ref={previewButton}
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void onPreview()}
      >
        {t("tord.preview")}
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {t("tord.save")}
      </button>
      <button
        type="button"
        className="btn btn-subtle"
        disabled={!dirty || busy}
        onClick={onDiscard}
      >
        {t("tord.discard")}
      </button>
      <span className="tord-status">
        {busy ? (
          <span role="status">{t(working === "preview" ? "tord.previewing" : "tord.saving")}</span>
        ) : previewed ? (
          <Badge tone="info">{t("tord.previewBadge")}</Badge>
        ) : (
          t("tord.amountsAfterSave")
        )}
      </span>
    </div>
  );
}
