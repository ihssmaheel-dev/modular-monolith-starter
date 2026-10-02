"use client";

import { Button } from "@repo/ui/components/ui/button";
import type { DataTablePaginationProps } from "./data-table.types";

export function DataTablePagination({
  page,
  totalPages,
  onPageChange,
  pageLabel,
  previousLabel,
  nextLabel,
}: DataTablePaginationProps) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-xs">
      <p className="text-xs text-muted-foreground">{pageLabel(page, totalPages)}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs rounded-md"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {previousLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs rounded-md"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
