"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  useTable,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { dataTableFeatures } from "./data-table-features";
import { DataTableViewOptions } from "./data-table-view-options";
import type { DataTableColumn, DataTableProps } from "./data-table.types";

function resolveUpdater<T>(updater: T | ((prev: T) => T), prev: T): T {
  return typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;
}

function columnClassName(column: { columnDef: { meta?: unknown } }): string | undefined {
  const meta = column.columnDef.meta as { className?: string } | undefined;
  return meta?.className;
}

export function DataTable<TData extends RowData>({
  data,
  columns: columnsProp,
  getRowId,
  isLoading,
  searchPlaceholder,
  searchValue,
  onSearch,
  toolbarActions,
  showViewOptions,
  viewOptionsLabel,
  viewOptionsTitle,
  enableRowSelection,
  onRowSelectionChange,
  selectAllLabel = "Select all",
  selectRowLabel = "Select row",
  selectedCountText,
  sorting: sortingProp,
  onSortingChange: onSortingChangeProp,
  columnVisibility: visibilityProp,
  onColumnVisibilityChange: onVisibilityChangeProp,
  emptyText,
  className,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const [internalVisibility, setInternalVisibility] = React.useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const sorting = sortingProp ?? internalSorting;
  const columnVisibility = visibilityProp ?? internalVisibility;

  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const next = resolveUpdater(updater, sortingProp ?? internalSorting);
      if (!sortingProp) setInternalSorting(next);
      onSortingChangeProp?.(next);
    },
    [sortingProp, internalSorting, onSortingChangeProp],
  );

  const handleVisibilityChange = React.useCallback(
    (updater: ColumnVisibilityState | ((prev: ColumnVisibilityState) => ColumnVisibilityState)) => {
      const next = resolveUpdater(updater, visibilityProp ?? internalVisibility);
      if (!visibilityProp) setInternalVisibility(next);
      onVisibilityChangeProp?.(next);
    },
    [visibilityProp, internalVisibility, onVisibilityChangeProp],
  );

  const selectColumn = React.useMemo<DataTableColumn<TData>[]>(() => {
    if (!enableRowSelection) return [];
    return [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label={selectAllLabel}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={selectRowLabel}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ];
  }, [enableRowSelection, selectAllLabel, selectRowLabel]);

  const columns = React.useMemo<DataTableColumn<TData>[]>(
    () => [...selectColumn, ...columnsProp],
    [selectColumn, columnsProp],
  );

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: handleVisibilityChange,
    onRowSelectionChange: setRowSelection,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  React.useEffect(() => {
    onRowSelectionChange?.(selectedRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

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
      {(onSearch || toolbarActions || showViewOptions) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onSearch ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded-md border-border/80 bg-background shadow-none"
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            {toolbarActions}
            {showViewOptions && (
              <DataTableViewOptions
                table={table}
                label={viewOptionsLabel}
                title={viewOptionsTitle}
              />
            )}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/80 bg-card overflow-hidden shadow-2xs">
        <Table>
          <TableHeader className="bg-muted/30 border-b border-border/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-none">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 h-8.5 px-3.5",
                      columnClassName(header.column),
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="transition-colors hover:bg-muted/40 border-b border-border/60 last:border-none"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3.5 py-2.5 text-xs sm:text-sm",
                        columnClassName(cell.column),
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {enableRowSelection && (
        <p className="text-xs text-muted-foreground">
          {selectedCountText
            ? selectedCountText(selectedRows.length, data.length)
            : `${selectedRows.length} of ${data.length} row(s) selected.`}
        </p>
      )}
    </div>
  );
}

export { DataTablePagination } from "./data-table-pagination";
export type * from "./data-table.types";
export { DataTableColumnHeader } from "./data-table-column-header";
export { DataTableViewOptions } from "./data-table-view-options";
export { dataTableFeatures, type DataTableFeatures } from "./data-table-features";
