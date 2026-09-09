import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-64 space-y-2 text-sm">
      <p>Profile</p>
      <Separator {...args} />
      <p>Sign out</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: (args) => (
    <div className="flex h-6 items-center gap-2 text-sm">
      <span>Page 1</span>
      <Separator {...args} orientation="vertical" />
      <span>of 4</span>
    </div>
  ),
};
