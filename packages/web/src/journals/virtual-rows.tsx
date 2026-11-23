import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
export function VirtualRows<T>({
  items,
  title,
  header,
  render,
  footer,
  forceVirtual = false,
  className,
}: {
  items: readonly T[];
  title: string;
  header: readonly string[];
  render: (item: T, index: number) => ReactNode;
  footer?: ReactNode;
  forceVirtual?: boolean;
  className?: string;
}) {
  const scroll = useRef<HTMLElement>(null),
    virtual = forceVirtual || items.length > 100;
  const rows = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const visible = virtual
    ? rows
        .getVirtualItems()
        .map((item) => ({ index: item.index, start: item.start, end: item.end }))
    : items.map((_, index) => ({ index, start: index * 44, end: (index + 1) * 44 }));
  return (
    <section
      className={className ? `journal-scroll ${className}` : "journal-scroll"}
      aria-label={title}
      ref={scroll}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual tables are keyboard scroll regions.
      tabIndex={0}
    >
      <table aria-label={title} aria-rowcount={items.length + (footer ? 2 : 1)}>
        <thead>
          <tr>
            {header.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {virtual && (
            <tr aria-hidden="true" tabIndex={-1}>
              <td
                className="journal-spacer"
                colSpan={header.length}
                style={{ height: visible[0]?.start ?? 0, padding: 0 }}
              />
            </tr>
          )}
          {visible.map(({ index }) => (
            <tr key={index} className="journal-row" aria-rowindex={index + 2}>
              {render(items[index], index)}
            </tr>
          ))}
          {virtual && (
            <tr aria-hidden="true" tabIndex={-1}>
              <td
                className="journal-spacer"
                colSpan={header.length}
                style={{ height: rows.getTotalSize() - (visible.at(-1)?.end ?? 0), padding: 0 }}
              />
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </section>
  );
}
