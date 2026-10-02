import type { Meta, StoryObj } from "@storybook/react-vite";
import { createColumnHelper, useTable } from "@tanstack/react-table";

import { dataTableFeatures, type DataTableFeatures } from "./data-table-features";
import { DataTableViewOptions } from "./data-table-view-options";

type Row = { name: string; email: string };

const columnHelper = createColumnHelper<DataTableFeatures, Row>();

function ViewOptionsHarness() {
  const table = useTable({
    features: dataTableFeatures,
    data: [{ name: "Ada", email: "ada@example.com" }],
    columns: columnHelper.columns([
      columnHelper.accessor("name", { header: "Name" }),
      columnHelper.accessor("email", { header: "Email" }),
    ]),
  });
  return <DataTableViewOptions table={table} />;
}

const meta = {
  title: "Composed/DataTableViewOptions",
  component: ViewOptionsHarness,
} satisfies Meta<typeof ViewOptionsHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
