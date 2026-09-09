import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback } from "./avatar";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "./message";

const meta = {
  title: "Primitives/Message",
  component: Message,
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  render: () => (
    <MessageGroup className="w-96 space-y-4">
      <Message>
        <MessageAvatar>
          <Avatar size="sm">
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>Ada · 12:04</MessageHeader>
          <p className="text-sm">The export finished — can you review it?</p>
          <MessageFooter>Seen</MessageFooter>
        </MessageContent>
      </Message>
    </MessageGroup>
  ),
};
