import { StorageError, type TradeReportingRepository } from "@erp/core/application";
import type { TradeReportItem, TradeReportScope } from "@erp/core/domain";
import type { Connection, Row } from "./types.ts";

function integer(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number))
    throw new StorageError("STORAGE_FAILURE");
  return number;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return value;
}
function item(row: Row): TradeReportItem {
  return {
    kind: text(row.kind) as TradeReportItem["kind"],
    side: text(row.side) as TradeReportItem["side"],
    documentId: text(row.item_id),
    party: text(row.party_id),
    currency: text(row.currency),
    externalNo: text(row.external_no),
    version: integer(row.historical_revision),
    currentVersion: integer(row.revision),
    accountingDate: text(row.accounting_date),
    documentDate: text(row.document_date),
    dueDate: row.kind === "invoice" ? text(row.due_date) : null,
    remainingNetMinor: integer(row.balance_net),
    remainingTaxMinor: integer(row.balance_tax),
    remainingGrossMinor: integer(row.balance_gross),
    overdueDays: row.kind === "invoice" ? Math.max(0, integer(row.days)) : null,
    ageingBucket:
      row.bucket === null ? null : (text(row.bucket) as TradeReportItem["ageingBucket"]),
    controlAccount: text(row.control_account),
    sourceReference: text(row.source_ref),
    journalId: text(row.journal_id),
  };
}
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
export function tradeReportingRepository(db: Pick<Connection, "query">): TradeReportingRepository {
  return {
    async tradeReportStamp(company) {
      const row = (
        await db.query(
          `SELECT
        (SELECT coalesce(max(sequence),0) FROM journal_entries WHERE company_id=?) journals,
        (SELECT coalesce(max(sequence),0) FROM trade_actions WHERE company_id=?) actions,
        (SELECT count(*) FROM settlements WHERE company_id=?) settlements`,
          [company, company, company],
        )
      )[0];
      return [row.journals, row.actions, row.settlements].map(integer).join(":");
    },
    async tradeReport(company, scope, cutoff, ageingDate, query) {
      const page = projection(company, scope, cutoff, ageingDate, {
        detail: true,
        where: "AND o.item_id>?",
        whereValues: [query.cursor ?? ""],
      });
      const rows = await db.query(
        `${page.sql} SELECT * FROM aged WHERE balance_gross>0 ORDER BY item_id LIMIT ?`,
        [...page.values, query.limit + 1],
      );
      const p = projection(company, scope, cutoff, ageingDate, { detail: false });
      const totals = (
        await db.query(
          `${p.sql} SELECT
        coalesce(sum(CASE WHEN kind='invoice' THEN balance_gross ELSE 0 END),0) invoiceGrossMinor,
        coalesce(sum(CASE WHEN bucket='notDue' THEN balance_gross ELSE 0 END),0) notDue,
        coalesce(sum(CASE WHEN bucket='overdue1_30' THEN balance_gross ELSE 0 END),0) overdue1_30,
        coalesce(sum(CASE WHEN bucket='overdue31_60' THEN balance_gross ELSE 0 END),0) overdue31_60,
        coalesce(sum(CASE WHEN bucket='overdue61_90' THEN balance_gross ELSE 0 END),0) overdue61_90,
        coalesce(sum(CASE WHEN bucket='overdue91Plus' THEN balance_gross ELSE 0 END),0) overdue91Plus,
        coalesce(sum(CASE WHEN kind='credit' THEN balance_gross ELSE 0 END),0) creditGrossMinor,
        coalesce(sum(CASE WHEN kind='advance' THEN balance_gross ELSE 0 END),0) advanceGrossMinor
        FROM (SELECT kind,bucket,sum(balance_gross) balance_gross FROM aged GROUP BY kind,bucket)`,
          p.values,
        )
      )[0];
      const items = rows.slice(0, query.limit).map(item);
      return {
        items,
        nextCursor: rows.length > query.limit ? (items.at(-1)?.documentId ?? null) : null,
        totals: {
          invoiceGrossMinor: integer(totals.invoiceGrossMinor),
          notDue: integer(totals.notDue),
          overdue1_30: integer(totals.overdue1_30),
          overdue31_60: integer(totals.overdue31_60),
          overdue61_90: integer(totals.overdue61_90),
          overdue91Plus: integer(totals.overdue91Plus),
          creditGrossMinor: integer(totals.creditGrossMinor),
          advanceGrossMinor: integer(totals.advanceGrossMinor),
        },
      };
    },
    async tradeReportItem(company, id, cutoff, ageingDate) {
      const p = projection(company, {}, cutoff, ageingDate, {
        detail: true,
        where: "AND o.item_id=?",
        whereValues: [id],
      });
      const row = (await db.query(`${p.sql} SELECT * FROM aged`, p.values))[0];
      return row ? item(row) : null;
    },
    async tradeReconciliation(company, cutoff) {
      const p = projection(company, {}, cutoff, cutoff, { detail: false });
      const rows = await db.query(
        `${p.sql}, subledger AS MATERIALIZED (
        SELECT control_account account,
          sum(balance_gross * CASE WHEN (side='AR' AND kind='invoice') OR (side='AP' AND kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM aged GROUP BY control_account
      ), accounts_in_scope AS MATERIALIZED (
        SELECT account FROM subledger UNION
        SELECT code FROM accounts WHERE company_id=? AND purpose='control' AND control_module IN('AP','AR')
      ), opening AS (
        SELECT o.control_account account,
          sum(o.gross_minor * CASE WHEN (o.side='AR' AND s.kind='invoice') OR (o.side='AP' AND s.kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM legacy_refs r JOIN open_items o ON o.company_id=? AND o.item_id=r.target_id
        JOIN trade_item_sources s ON s.company_id=o.company_id AND s.item_id=o.item_id
        WHERE r.source IN('teaching','enterprise') AND r.object_type='opening_items'
          AND o.accounting_date<=?
        GROUP BY o.control_account
      ), other_entries AS MATERIALIZED (
        SELECT j.id FROM journal_entries j
        LEFT JOIN receipts r ON r.company_id=j.company_id AND r.idempotency_key=j.receipt_key
        WHERE j.company_id=? AND j.accounting_date<=? AND json_extract(r.result,'$.module') IS NOT 'TRADE'
      ), gl_parts AS (
        SELECT account_code account,sum(debit_minor-credit_minor) amount,0 other FROM journal_lines
        WHERE company_id=? AND account_code IN(SELECT account FROM accounts_in_scope)
          AND period<substr(?,1,7) GROUP BY account_code
        UNION ALL
        SELECT l.account_code,sum(l.debit_minor-l.credit_minor),0 FROM journal_lines l
        JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id
        WHERE l.company_id=? AND l.account_code IN(SELECT account FROM accounts_in_scope)
          AND l.period=substr(?,1,7) AND j.accounting_date<=? GROUP BY l.account_code
        UNION ALL
        SELECT account_code,0,sum(debit_minor-credit_minor) FROM journal_lines
        WHERE company_id=? AND account_code IN(SELECT account FROM accounts_in_scope)
          AND entry_id IN(SELECT id FROM other_entries) GROUP BY account_code
      ), gl AS (
        -- A line's period is its entry's month, so whole earlier periods are summed from the
        -- covering index and only the cutoff month checks entry dates. Trade GL is everything
        -- except lines of entries whose receipt module is not TRADE.
        SELECT account,sum(amount) balance,sum(amount)-sum(other) trade FROM gl_parts GROUP BY account
      ) SELECT a.account,coalesce(s.balance,0) subledger,coalesce(g.balance,0) gl,
        coalesce(g.trade,0) trade,coalesce(o.balance,0) opening FROM accounts_in_scope a
        LEFT JOIN subledger s USING(account) LEFT JOIN gl g USING(account)
        LEFT JOIN opening o USING(account) ORDER BY a.account`,
        [
          ...p.values,
          company,
          company,
          cutoff,
          company,
          cutoff,
          company,
          cutoff,
          company,
          cutoff,
          cutoff,
          company,
        ],
      );
      return rows.map((row) => {
        const subledgerMinor = integer(row.subledger),
          glMinor = integer(row.gl),
          tradeGlMinor = integer(row.trade),
          openingGlMinor = integer(row.opening);
        // D25 single rule: P = 0 without opening items, so M1 results are unchanged.
        return {
          account: text(row.account),
          subledgerMinor,
          glMinor,
          tradeGlMinor,
          openingGlMinor,
          otherSourceMinor: integer(glMinor - tradeGlMinor - openingGlMinor),
          tradeDifferenceMinor: integer(tradeGlMinor + openingGlMinor - subledgerMinor),
          differenceMinor: integer(glMinor - subledgerMinor),
        };
      });
    },
  };
}
