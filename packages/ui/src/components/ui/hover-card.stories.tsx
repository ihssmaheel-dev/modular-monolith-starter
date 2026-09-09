import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback } from "./avatar";
import { Button } from "./button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

const meta = {
  title: "Primitives/HoverCard",
  component: HoverCard,
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <HoverCard {...args} defaultOpen>
      <HoverCardTrigger render={<Button variant="link">Ada Lovelace</Button>} />
      <HoverCardContent className="w-64">
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">Ada Lovelace</p>
            <p className="text-xs text-muted-foreground">ada@example.com</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
