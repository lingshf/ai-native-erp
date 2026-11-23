import { Link } from "react-router-dom";
import type { T } from "./invoice-model.ts";

/** Router path of an order's detail on the order page (TINV-03 reads `company` and `order`). */
export const sourceOrderPath = (company: string, orderId: string) =>
  `/trade-orders?company=${encodeURIComponent(company)}&order=${encodeURIComponent(orderId)}`;

// A router link: keyboard-activatable and openable in a new tab; leaving a dirty draft is confirmed
// by the page's leave guard like any other in-app link.
export function SourceOrderCell({
  company,
  orderId,
  t,
}: {
  company: string;
  orderId: string | null;
  t: T;
}) {
  return (
    <td className="tinv-source">
      {orderId === null ? (
        <>
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">{t("tinv.noSourceOrder")}</span>
        </>
      ) : (
        <Link to={sourceOrderPath(company, orderId)} title={orderId}>
          {orderId}
        </Link>
      )}
    </td>
  );
}
