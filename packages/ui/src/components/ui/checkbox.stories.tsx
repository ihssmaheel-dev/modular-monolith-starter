import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";
import { Label } from "./label";

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { "aria-label": "Accept terms" },
};

export const Checked: Story = {
  args: { defaultChecked: true, "aria-label": "Accept terms" },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} id="story-terms" defaultChecked />
      <Label htmlFor="story-terms">Email me the receipt</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, "aria-label": "Accept terms" },
};
