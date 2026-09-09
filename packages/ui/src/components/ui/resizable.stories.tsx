import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable";

const meta = {
  title: "Primitives/Resizable",
  component: ResizablePanelGroup,
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ResizablePanelGroup
      {...args}
      orientation="horizontal"
      className="h-40 w-full rounded-lg border"
    >
      <ResizablePanel defaultSize={30} minSize={20}>
        <p className="p-3 text-sm">Sidebar</p>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={70}>
        <p className="p-3 text-sm">Editor</p>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
