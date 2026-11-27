import type { TradeReportScope } from "@erp/core/domain";

// Immutable action before/after differences are aggregated, never replayed into current state.
// Each item's settlements and action changes up to the cutoff are summed by correlated index
// lookups, so a page stops after LIMIT open rows and totals touch only the columns they need.
const paidSum = (column: string) =>
  `(SELECT sum(p.${column}) FROM settlements p WHERE p.company_id=b.company_id
    AND p.item_id=b.item_id AND p.accounting_date<=?)`;
// Change fields are read from the record by full path, so SQLite reuses one cached parse of the
// record instead of re-parsing every extracted change value.
const changedFrom = `FROM trade_action_items i JOIN trade_actions a
    ON a.company_id=i.company_id AND a.action_id=i.action_id,json_each(a.record,'$.receipt.changes') c
    WHERE i.company_id=b.company_id AND i.item_id=b.item_id AND a.accounting_date<=?
    AND json_extract(a.record,c.fullkey||'.before.itemId')=i.item_id`;
const changedSum = (field: string) =>
  `(SELECT sum(json_extract(a.record,c.fullkey||'.before.${field}')-json_extract(a.record,c.fullkey||'.after.${field}')) ${changedFrom})`;
const bucket = `CASE WHEN kind<>'invoice' THEN NULL WHEN days<=0 THEN 'notDue'
  WHEN days<=30 THEN 'overdue1_30' WHEN days<=60 THEN 'overdue31_60'
  WHEN days<=90 THEN 'overdue61_90' ELSE 'overdue91Plus' END bucket`;
function projection(
  company: string,
  scope: TradeReportScope,
  cutoff: string,
  ageingDate: string,
  shape: { detail: boolean; where?: string; whereValues?: readonly string[] },
) {
  const scoped = `WHERE o.company_id=? AND o.accounting_date<=?
      ${scope.party ? "AND o.party_id=?" : ""} ${scope.side ? "AND o.side=?" : ""} ${shape.where ?? ""}`;
  const scopeValues = [
    company,
    cutoff,
    ...(scope.party ? [scope.party] : []),
    ...(scope.side ? [scope.side] : []),
    ...(shape.whereValues ?? []),
  ];
  // Aggregates omit the source-journal join: enforced foreign keys guarantee it always matches.
  if (!shape.detail)
    return {
      sql: `WITH aged AS (
      SELECT b.side,b.control_account,b.kind,
        b.gross_minor-coalesce(${paidSum("applied_gross_minor")},0)-coalesce(${changedSum("remainingGross")},0) balance_gross,
        ${bucket}
      FROM (SELECT o.company_id,o.item_id,o.side,o.control_account,o.gross_minor,s.kind,
          CAST(julianday(?)-julianday(o.due_date) AS INTEGER) days
        FROM open_items o JOIN trade_item_sources s USING(company_id,item_id) ${scoped}) b
    )`,
      values: [cutoff, cutoff, ageingDate, ...scopeValues],
    };
  return {
    sql: `WITH balances AS (
      SELECT b.*,b.gross_minor-coalesce(${paidSum("applied_gross_minor")},0)-coalesce(${changedSum("remainingGross")},0) balance_gross,
        b.net_minor-coalesce(${paidSum("applied_net_minor")},0)-coalesce(${changedSum("remainingNet")},0) balance_net,
        b.tax_minor-coalesce(${paidSum("applied_tax_minor")},0)-coalesce(${changedSum("remainingTax")},0) balance_tax,
        1+(SELECT count(*) FROM settlements p WHERE p.company_id=b.company_id AND p.item_id=b.item_id
          AND p.accounting_date<=?)+(SELECT count(*) ${changedFrom}) historical_revision,
        CAST(julianday(?)-julianday(b.due_date) AS INTEGER) days
      FROM (SELECT o.*,s.kind,s.external_no,s.journal_id,j.source_ref
        FROM open_items o CROSS JOIN trade_item_sources s USING(company_id,item_id)
        JOIN journal_entries j ON j.company_id=s.company_id AND j.id=s.journal_id ${scoped}) b
    ), aged AS (SELECT *,${bucket} FROM balances)`,
    values: [
      cutoff,
      cutoff,
      cutoff,
      cutoff,
      cutoff,
      cutoff,
      cutoff,
      cutoff,
      ageingDate,
      ...scopeValues,
    ],
  };
}

export { projection };
