import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { createColumnHelper } from "@tanstack/react-table";

import { Badge } from "../../ui/badge";
import { DataTable } from "./data-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import type { DataTableFeatures } from "./data-table-features";
import type { DataTableColumn } from "./data-table.types";

type Note = { id: string; title: string; updated: string; shared: boolean };

const rows: Note[] = [
  { id: "n-1", title: "Launch checklist", updated: "Mar 15, 2026", shared: true },
  { id: "n-2", title: "Meeting notes", updated: "Mar 14, 2026", shared: false },
  { id: "n-3", title: "Ideas backlog", updated: "Mar 12, 2026", shared: false },
];

const columnHelper = createColumnHelper<DataTableFeatures, Note>();

const columns: DataTableColumn<Note>[] = columnHelper.columns([
  columnHelper.accessor("title", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("updated", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("shared", {
    header: "Sharing",
    cell: (info) => (info.getValue() ? <Badge>Shared</Badge> : <span>Private</span>),
    enableSorting: false,
  }),
]);

const meta = {
  title: "Composed/DataTable",
  component: DataTable<Note>,
  args: { onSearch: fn(), onRowSelectionChange: fn() },
} satisfies Meta<typeof DataTable<Note>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowId: (row) => row.id,
  },
};

export const WithSearch: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowId: (row) => row.id,
    searchPlaceholder: "Search notes…",
    searchValue: "",
  },
};

export const WithSortingAndVisibility: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowId: (row) => row.id,
    showViewOptions: true,
  },
};

export const WithRowSelection: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowId: (row) => row.id,
    enableRowSelection: true,
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns,
    emptyText: "No notes yet.",
    getRowId: (row) => row.id,
    isLoading: true,
    searchPlaceholder: "Search notes…",
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    emptyText: "No notes match your filters.",
    getRowId: (row) => row.id,
  },
};
