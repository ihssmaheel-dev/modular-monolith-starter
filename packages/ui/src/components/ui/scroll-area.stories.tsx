import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "./scroll-area";

const meta = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ScrollArea {...args} className="h-40 w-72 rounded-lg border p-3">
      {Array.from({ length: 20 }).map((_, index) => (
        <p key={index} className="py-1 text-sm">
          Notification {index + 1}
        </p>
      ))}
    </ScrollArea>
  ),
};
