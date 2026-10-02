import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DataTablePagination } from "./data-table-pagination";

const meta = {
  title: "Composed/DataTable/Pagination",
  component: DataTablePagination,
  args: { onPageChange: fn() },
} satisfies Meta<typeof DataTablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    page: 1,
    totalPages: 5,
    pageLabel: (p, t) => `Page ${p} of ${t}`,
    previousLabel: "Previous",
    nextLabel: "Next",
  },
};
