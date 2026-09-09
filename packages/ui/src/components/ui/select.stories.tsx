import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const meta = {
  title: "Primitives/Select",
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Select {...args} defaultValue="daily">
      <SelectTrigger className="w-44" aria-label="Digest cadence">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="realtime">Instant</SelectItem>
        <SelectItem value="hourly">Hourly digest</SelectItem>
        <SelectItem value="daily">Daily digest</SelectItem>
      </SelectContent>
    </Select>
  ),
};
