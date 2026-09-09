import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Badge } from "../ui/badge";
import { DataTable, type DataTableColumn } from "./data-table";

type Note = { id: string; title: string; updated: string; shared: boolean };

const rows: Note[] = [
  { id: "n-1", title: "Launch checklist", updated: "Mar 15, 2026", shared: true },
  { id: "n-2", title: "Meeting notes", updated: "Mar 14, 2026", shared: false },
  { id: "n-3", title: "Ideas backlog", updated: "Mar 12, 2026", shared: false },
];

const columns: DataTableColumn<Note>[] = [
  { key: "title", header: "Title", cell: (row) => row.title },
  { key: "updated", header: "Updated", cell: (row) => row.updated },
  {
    key: "shared",
    header: "Sharing",
    cell: (row) => (row.shared ? <Badge>Shared</Badge> : <span>Private</span>),
  },
];

const meta = {
  title: "Composed/DataTable",
  component: DataTable<Note>,
  args: { onSearch: fn() },
} satisfies Meta<typeof DataTable<Note>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowKey: (row) => row.id,
  },
};

export const WithSearch: Story = {
  args: {
    data: rows,
    columns,
    emptyText: "No notes yet.",
    getRowKey: (row) => row.id,
    searchPlaceholder: "Search notes…",
    searchValue: "",
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns,
    emptyText: "No notes yet.",
    getRowKey: (row) => row.id,
    isLoading: true,
    searchPlaceholder: "Search notes…",
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    emptyText: "No notes match your filters.",
    getRowKey: (row) => row.id,
  },
};
