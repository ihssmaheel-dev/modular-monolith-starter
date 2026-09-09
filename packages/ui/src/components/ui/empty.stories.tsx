import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderOpen } from "lucide-react";
import { Button } from "./button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

const meta = {
  title: "Primitives/Empty",
  component: Empty,
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Empty {...args} className="w-96 border">
      <EmptyHeader>
        <EmptyMedia>
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>No files yet</EmptyTitle>
        <EmptyDescription>Upload your first file to get started.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">Upload file</Button>
      </EmptyContent>
    </Empty>
  ),
};
