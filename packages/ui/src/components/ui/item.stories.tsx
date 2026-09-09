import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText } from "lucide-react";
import { Button } from "./button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "./item";

const meta = {
  title: "Primitives/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ItemGroup className="w-96">
      <Item {...args}>
        <ItemMedia>
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Launch checklist</ItemTitle>
          <ItemDescription>Updated Mar 15, 2026 · Shared</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  ),
};
