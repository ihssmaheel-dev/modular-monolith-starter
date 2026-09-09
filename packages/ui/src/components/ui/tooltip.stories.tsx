import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <TooltipProvider>
      <Tooltip {...args}>
        <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
        <TooltipContent>Exports finish in a few seconds.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
