import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

const meta = {
  title: "Primitives/Pagination",
  component: Pagination,
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Pagination {...args}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious onClick={fn()} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink isActive onClick={fn()}>
            1
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink onClick={fn()}>2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext onClick={fn()} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ),
};
