import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

// Features enabled for every data table. Anything not listed here is
// tree-shaken out of the bundle. Server owns pagination and filtering, so
// only client-side sorting, visibility, and selection are registered.
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
  },
});

// Pass as the first generic argument to ColumnDef, Column, and Table so
// each type knows which feature APIs are available.
export type DataTableFeatures = typeof dataTableFeatures;
