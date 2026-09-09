import type { Meta, StoryObj } from "@storybook/react-vite";
import { AspectRatio } from "./aspect-ratio";

const meta = {
  title: "Primitives/AspectRatio",
  component: AspectRatio,
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SixteenByNine: Story = {
  args: { ratio: 16 / 9 },
  render: (args) => (
    <div className="w-96">
      <AspectRatio {...args} className="bg-muted">
        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
          16 : 9
        </p>
      </AspectRatio>
    </div>
  ),
};
