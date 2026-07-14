import * as React from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn, fmt } from "@/lib/utils";

// Generic table (SPEC §4.3): sticky spec'd header, 52-56px rows, hover, optional
// checkbox column, sortable headers, server-side pagination footer, row ⋯ menu.

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  selectable?: boolean;
  selected?: Set<string | number>;
  onSelectChange?: (next: Set<string | number>) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  rowActions?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
  emptyLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  selected,
  onSelectChange,
  sort,
  onSortChange,
  rowActions,
  footer,
  emptyLabel = "No records",
}: DataTableProps<T>) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectChange) return;
    if (allSelected) onSelectChange(new Set());
    else onSelectChange(new Set(rows.map(rowKey)));
  };
  const toggleOne = (k: string | number) => {
    if (!onSelectChange || !selected) return;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onSelectChange(next);
  };

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-card">
            <tr className="border-b border-[#EEF2F7]">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={!!allSelected} onChange={toggleAll} className="accent-primary" />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align ?? "left" }}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-text3"
                >
                  {c.sortable ? (
                    <button
                      onClick={() => onSortChange?.(c.key)}
                      className="inline-flex items-center gap-1 hover:text-text1"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ChevronUp size={13} />
                        ) : (
                          <ChevronDown size={13} />
                        )
                      ) : (
                        <ChevronsUpDown size={13} className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {rowActions && <th className="w-10 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-text3"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const k = rowKey(row);
                return (
                  <tr key={k} className="border-b border-[#EEF2F7] hover:bg-[#F8FAFC]">
                    {selectable && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!selected?.has(k)}
                          onChange={() => toggleOne(k)}
                          className="accent-primary"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        style={{ textAlign: c.align ?? "left" }}
                        className="px-3 py-3 text-sm text-text1"
                      >
                        {c.render(row)}
                      </td>
                    ))}
                    {rowActions && <td className="px-3 py-3 text-right">{rowActions(row)}</td>}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {footer && <div className="flex items-center justify-between px-4 py-3 text-sm text-text2">{footer}</div>}
    </div>
  );
}

/** Standard pagination footer ("Showing 1 to N of M" + page pills). */
export function PaginationFooter({
  page,
  pageSize,
  total,
  onPage,
  unit = "entities",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  unit?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // windowed page list with ellipses: 1 … (page-1) page (page+1) … last
  const nums = new Set<number>([1, page - 1, page, page + 1, pages]);
  const shown = [...nums].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const items: (number | "…")[] = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) items.push("…");
    items.push(p);
  });

  return (
    <>
      <span>
        Showing {fmt(from)} to {fmt(to)} of {fmt(total)} {unit}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          aria-label="Previous page"
          onClick={() => onPage(page - 1)}
          className={cn("rounded-md border border-border px-2 py-1 text-xs", page <= 1 && "opacity-40")}
        >
          ‹
        </button>
        {items.map((it, i) =>
          it === "…" ? (
            <span key={`e${i}`} className="px-1 text-text3">…</span>
          ) : (
            <button
              key={it}
              aria-label={it === pages && pages > 1 ? "Last page" : undefined}
              onClick={() => onPage(it)}
              className={cn(
                "min-w-[28px] rounded-md border px-2 py-1 text-xs",
                it === page ? "border-primary bg-primary text-white" : "border-border",
              )}
            >
              {it}
            </button>
          ),
        )}
        <button
          disabled={page >= pages}
          aria-label="Next page"
          onClick={() => onPage(page + 1)}
          className={cn("rounded-md border border-border px-2 py-1 text-xs", page >= pages && "opacity-40")}
        >
          ›
        </button>
      </div>
    </>
  );
}
