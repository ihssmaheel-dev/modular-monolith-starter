import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { Switch } from "./switch";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { "aria-label": "Email notifications" },
};

export const Checked: Story = {
  args: { defaultChecked: true, "aria-label": "Email notifications" },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch {...args} id="story-switch" defaultChecked />
      <Label htmlFor="story-switch">Push notifications</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, "aria-label": "Email notifications" },
};
