import type * as React from "react";
import type {
  ColumnDef,
  ColumnVisibilityState,
  RowData,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";

import type { DataTableFeatures } from "./data-table-features";

export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData>;

export type DataTableProps<TData extends RowData> = {
  data: TData[];
  columns: DataTableColumn<TData>[];
  getRowId?: (row: TData) => string;
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  toolbarActions?: React.ReactNode;
  showViewOptions?: boolean;
  viewOptionsLabel?: string;
  viewOptionsTitle?: string;
  enableRowSelection?: boolean;
  onRowSelectionChange?: (rows: TData[]) => void;
  selectAllLabel?: string;
  selectRowLabel?: string;
  selectedCountText?: (selected: number, total: number) => string;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  emptyText: string;
  className?: string;
};

export type { ColumnVisibilityState, RowData, RowSelectionState, SortingState };

export type DataTablePaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageLabel: (page: number, totalPages: number) => string;
  previousLabel: string;
  nextLabel: string;
};
