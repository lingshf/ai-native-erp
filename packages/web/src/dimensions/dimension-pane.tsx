import type { CompanyDto, DimensionDto } from "@erp/core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { DimensionActions } from "./dimension-actions.tsx";
import { DimensionEditor } from "./dimension-editor.tsx";
import { Notice } from "./dimension-failure.tsx";
import { DimensionTable } from "./dimension-table.tsx";
import type { Kind, T } from "./dimension-types.ts";
import { LoadMoreButton } from "./load-more-button.tsx";
import { pageItems } from "./page-items.ts";
import { useDimensionPage } from "./use-dimension-page.ts";

export function DimensionPane({
  company,
  kind,
  dimension,
  t,
}: {
  company: CompanyDto;
  kind: Kind;
  dimension: string;
  t: T;
}) {
  const [editing, setEditing] = useState<DimensionDto | null | undefined>();
  const client = useQueryClient();
  const queryKey = ["dimensions", company.code, kind, dimension];
  const refresh = () => void client.resetQueries({ queryKey, exact: true });
  const page = useDimensionPage(company.code, kind, dimension);
  const rows = pageItems(page.data);
  const scroll = useRef<HTMLElement>(null);
  const virtual = rows.length > 100;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  const before = virtual ? (measured[0]?.start ?? 0) : 0,
    after = virtual ? virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0) : 0;
  return (
    <>
      <DimensionActions
        editing={editing !== undefined}
        onNew={() => setEditing(null)}
        onRefresh={refresh}
        t={t}
      />
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && <Notice error={page.error} t={t} retry={() => void page.refetch()} />}
      <DimensionTable
        kind={kind}
        rows={rows}
        visible={visible}
        before={before}
        after={after}
        scroll={scroll}
        empty={Boolean(page.data) && rows.length === 0}
        onEdit={setEditing}
        t={t}
      />
      <LoadMoreButton pages={page} className="btn btn-secondary ui-master-more" t={t} />
      {editing !== undefined && (
        <DimensionEditor
          key={editing ? `${editing.code}:${editing.revision}` : "new"}
          company={company}
          kind={kind}
          dimension={dimension}
          initial={editing}
          t={t}
          close={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
