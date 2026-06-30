"use client";

import { cn } from "@/lib/utils";

export function DataTable({
  headers,
  rows,
  compact,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-[11px] text-[var(--text-muted)]">
        No records
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <thead className="sticky top-0 z-[1] bg-[var(--bg-sidebar)]">
          <tr className="border-b border-[var(--border-subtle)]">
            {headers.map((h) => (
              <th
                key={h}
                className={cn(
                  "px-3 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]",
                  compact ? "py-1.5" : "py-2"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="group border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "max-w-0 truncate px-3 text-[11px] text-[var(--text-primary)]",
                    compact ? "py-1.5" : "py-2",
                    j === 0 && "font-medium"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
