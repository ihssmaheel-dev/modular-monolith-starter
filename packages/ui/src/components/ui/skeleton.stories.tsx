import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListLoading: Story = {
  render: (args) => (
    <div className="w-80 space-y-2">
      <Skeleton {...args} className="h-10" />
      <Skeleton {...args} className="h-10" />
      <Skeleton {...args} className="h-10 w-2/3" />
    </div>
  ),
};
