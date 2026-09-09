import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Toaster, toast } from "./toast";

const meta = {
  title: "Primitives/Toast",
  component: Toaster,
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: "Export ready",
            description: "Your data export finished downloading.",
            type: "success",
          })
        }
      >
        Show toast
      </Button>
      <Toaster {...args} />
    </div>
  ),
};
