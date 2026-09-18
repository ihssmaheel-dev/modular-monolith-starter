"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
};

export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  searchValue?: string;
  toolbarActions?: React.ReactNode;
  emptyText: string;
  className?: string;
  getRowKey: (row: T) => string;
};

export function DataTable<T>({
  data,
  columns,
  isLoading,
  searchPlaceholder,
  onSearch,
  searchValue,
  toolbarActions,
  emptyText,
  className,
  getRowKey,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={cn("space-y-2.5", className)}>
        {onSearch && <Skeleton className="h-8 w-full max-w-xs rounded-md" />}
        <div className="rounded-md border border-border/80 bg-card">
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {(onSearch || toolbarActions) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onSearch && (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded-md border-border/80 bg-background shadow-none"
              />
            </div>
          )}
          {toolbarActions && (
            <div className="flex items-center gap-1.5 shrink-0">{toolbarActions}</div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border/80 bg-card overflow-hidden shadow-2xs">
        <Table>
          <TableHeader className="bg-muted/30 border-b border-border/80">
            <TableRow className="hover:bg-transparent border-none">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 h-8.5 px-3.5",
                    col.className,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  className="transition-colors hover:bg-muted/40 border-b border-border/60 last:border-none"
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn("px-3.5 py-2.5 text-xs sm:text-sm", col.className)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function DataTablePagination({
  page,
  totalPages,
  onPageChange,
  pageLabel,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageLabel: (page: number, totalPages: number) => string;
  previousLabel: string;
  nextLabel: string;
}) {
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
