import type * as React from "react";

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

export type DataTablePaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageLabel: (page: number, totalPages: number) => string;
  previousLabel: string;
  nextLabel: string;
};
