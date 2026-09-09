import type { Meta, StoryObj } from "@storybook/react-vite";
import { BellRing } from "lucide-react";
import { Button } from "../ui/button";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Composed/EmptyState",
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <BellRing className="size-8" />,
    title: "You're all caught up.",
    description: "New notifications will show up here.",
    action: <Button size="sm">View archive</Button>,
  },
};

export const Minimal: Story = {
  args: { title: "No results." },
};
