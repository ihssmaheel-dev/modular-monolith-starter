import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./message-scroller";

const meta = {
  title: "Primitives/MessageScroller",
  component: MessageScroller,
} satisfies Meta<typeof MessageScroller>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MessageScrollerProvider>
      <MessageScroller className="h-64 w-96 rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="space-y-2 p-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <MessageScrollerItem key={index}>
                <p className="rounded-lg bg-muted p-2 text-sm">Message {index + 1}</p>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  ),
};
