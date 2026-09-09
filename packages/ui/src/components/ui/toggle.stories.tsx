import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bold } from "lucide-react";
import { Toggle } from "./toggle";

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Toggle {...args} aria-label="Bold">
      <Bold />
    </Toggle>
  ),
};

export const Pressed: Story = {
  render: (args) => (
    <Toggle {...args} aria-label="Bold" defaultPressed>
      <Bold />
    </Toggle>
  ),
};
