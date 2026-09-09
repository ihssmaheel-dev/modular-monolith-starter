import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Write the note…", "aria-label": "Note content", className: "w-72" },
};

export const WithValue: Story = {
  args: {
    defaultValue: "Milk, eggs, oat milk.",
    "aria-label": "Shopping list",
    className: "w-72",
  },
};
