import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { ButtonGroup, ButtonGroupSeparator } from "./button-group";

const meta = {
  title: "Primitives/ButtonGroup",
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Cancel</Button>
      <ButtonGroupSeparator />
      <Button>Save changes</Button>
    </ButtonGroup>
  ),
};
