export const OPEN_ITEMS_PAGE_SIZE = 100;
// Matches the party pattern in isValidReportQuery: one leading character plus {0,59}.
export const PARTY_MAX_LENGTH = 60;
type Applied = { month: string; party: string; side: string };
export function isValidReportQuery({ month, party, side, view }: Applied & { view: string }) {
  return (
    (!month || /^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) &&
    (!party || /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u.test(party)) &&
    ["", "AP", "AR"].includes(side) &&
    ["openItems", "ageing", "reconciliation"].includes(view)
  );
}
export function reportScopes(company: string, { month, party, side }: Applied) {
  const scope = new URLSearchParams({ company });
  if (month) scope.set("month", month);
  const filtered = new URLSearchParams(scope);
  if (party) filtered.set("party", party);
  if (side) filtered.set("side", side);
  return { scope, filtered };
}
export function ageingTone(bucket: string) {
  return bucket === "notDue" ? "success" : /61|91/u.test(bucket) ? "danger" : "warning";
}
