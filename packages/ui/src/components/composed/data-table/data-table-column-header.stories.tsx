import type { Meta, StoryObj } from "@storybook/react-vite";
import { createColumnHelper, useTable } from "@tanstack/react-table";

import { DataTableColumnHeader } from "./data-table-column-header";
import { dataTableFeatures, type DataTableFeatures } from "./data-table-features";

type Row = { name: string };

const columnHelper = createColumnHelper<DataTableFeatures, Row>();

function HeaderHarness({ sortable }: { sortable: boolean }) {
  const table = useTable({
    features: dataTableFeatures,
    data: [{ name: "Ada" }],
    columns: columnHelper.columns([
      columnHelper.accessor("name", {
        header: "Name",
        enableSorting: sortable,
      }),
    ]),
  });
  const column = table.getAllColumns()[0];
  if (!column) return null;
  return <DataTableColumnHeader column={column} title="Name" />;
}

const meta = {
  title: "Composed/DataTableColumnHeader",
  component: HeaderHarness,
} satisfies Meta<typeof HeaderHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sortable: Story = {
  args: { sortable: true },
};

export const Plain: Story = {
  args: { sortable: false },
};
