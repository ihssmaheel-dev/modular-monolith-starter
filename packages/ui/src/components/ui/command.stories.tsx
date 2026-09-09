import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

const meta = {
  title: "Primitives/Command",
  component: Command,
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Command {...args} className="w-80 border">
      <CommandInput placeholder="Jump to…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Notes">
          <CommandItem value="launch">Launch checklist</CommandItem>
          <CommandItem value="ideas">Ideas backlog</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem value="new">New note</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
