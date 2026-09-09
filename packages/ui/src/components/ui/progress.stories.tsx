import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./progress";

const meta = {
  title: "Primitives/Progress",
  component: Progress,
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 60, "aria-label": "Upload progress", className: "w-64" },
};

export const Complete: Story = {
  args: { value: 100, "aria-label": "Upload progress", className: "w-64" },
};
