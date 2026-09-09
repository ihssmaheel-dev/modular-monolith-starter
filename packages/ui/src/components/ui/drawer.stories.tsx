import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";

const meta = {
  title: "Primitives/Drawer",
  component: Drawer,
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Drawer {...args} defaultOpen>
      <DrawerTrigger render={<Button variant="outline">Open details</Button>} />
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Note details</DrawerTitle>
          <DrawerDescription>Attachments, history, and sharing.</DrawerDescription>
        </DrawerHeader>
        <p className="px-4 text-sm text-muted-foreground">Detail content goes here.</p>
      </DrawerContent>
    </Drawer>
  ),
};
