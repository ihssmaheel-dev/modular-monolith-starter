import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

const meta = {
  title: "Primitives/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Popover {...args} defaultOpen>
      <PopoverTrigger render={<Button variant="outline">What is this?</Button>} />
      <PopoverContent className="w-64">
        <PopoverTitle>Storage quota</PopoverTitle>
        <PopoverDescription>You have used 1.2 GB of 10 GB.</PopoverDescription>
      </PopoverContent>
    </Popover>
  ),
};
