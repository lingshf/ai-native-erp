import type { DimensionMap, TradeControlSegment } from "@erp/core/domain";
import { tradeDimensionKey } from "@erp/core/domain";
import { int, json, str } from "./trade-document-rows.ts";
import type { Connection } from "./types.ts";

export async function segments(
  db: Pick<Connection, "query">,
  company: string,
  ids: readonly string[],
) {
  const result = new Map<string, TradeControlSegment[]>();
  if (!ids.length) return result;
  const rows = await db.query(
    `SELECT * FROM trade_control_segments WHERE company_id=? AND item_id IN(${ids.map(() => "?").join(",")}) ORDER BY item_id,dimension_key COLLATE BINARY`,
    [company, ...ids],
  );
  for (const row of rows) {
    const id = str(row.item_id),
      list = result.get(id) ?? [];
    list.push({
      dimensions: json<DimensionMap>(row.dimension_key),
      gross: int(row.gross_minor),
      remainingGross: int(row.remaining_gross_minor),
    });
    result.set(id, list);
  }
  return result;
}
export async function insertSegments(
  db: Pick<Connection, "query">,
  company: string,
  id: string,
  values: readonly TradeControlSegment[],
) {
  for (const segment of values)
    await db.query("INSERT INTO trade_control_segments VALUES(?,?,?,?,?)", [
      company,
      id,
      tradeDimensionKey(segment.dimensions),
      segment.gross,
      segment.remainingGross,
    ]);
}
