import type { Meta, StoryObj } from "@storybook/react-vite";
import { NativeSelect, NativeSelectOption } from "./native-select";

const meta = {
  title: "Primitives/NativeSelect",
  component: NativeSelect,
} satisfies Meta<typeof NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <NativeSelect {...args} defaultValue="daily" aria-label="Digest cadence">
      <NativeSelectOption value="realtime">Instant</NativeSelectOption>
      <NativeSelectOption value="hourly">Hourly digest</NativeSelectOption>
      <NativeSelectOption value="daily">Daily digest</NativeSelectOption>
    </NativeSelect>
  ),
};
