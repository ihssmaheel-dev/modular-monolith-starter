import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../ui/button";
import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "Composed/ConfirmDialog",
  component: ConfirmDialog,
  args: { onConfirm: fn() },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Delete note?",
    description: "This moves the note to trash. You can restore it within 30 days.",
    confirmText: "Delete",
    cancelText: "Cancel",
    pendingText: "Deleting…",
    open: true,
    trigger: <Button variant="outline">Delete note</Button>,
  },
};

export const Destructive: Story = {
  args: {
    title: "Erase organization?",
    description: "This permanently removes the workspace and all of its data.",
    confirmText: "Erase everything",
    cancelText: "Cancel",
    pendingText: "Erasing…",
    variant: "destructive",
    open: true,
    trigger: <Button variant="destructive">Erase organization</Button>,
  },
};
