import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";

const meta = {
  title: "Primitives/InputGroup",
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithIcon: Story = {
  render: (args) => (
    <InputGroup {...args} className="w-72">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search notes…" aria-label="Search notes" />
    </InputGroup>
  ),
};
