import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="w-72 space-y-2">
      <Label {...args} htmlFor="story-label-demo">
        Workspace name
      </Label>
      <Input id="story-label-demo" defaultValue="Acme" />
    </div>
  ),
};
