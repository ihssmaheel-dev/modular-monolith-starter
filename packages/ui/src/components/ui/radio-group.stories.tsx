import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args} defaultValue="daily" className="space-y-2">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="realtime" id="story-instant" />
        <Label htmlFor="story-instant">Instant</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="daily" id="story-daily" />
        <Label htmlFor="story-daily">Daily digest</Label>
      </div>
    </RadioGroup>
  ),
};
