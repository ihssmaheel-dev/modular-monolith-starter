import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bubble, BubbleContent, BubbleGroup } from "./bubble";

const meta = {
  title: "Primitives/Bubble",
  component: Bubble,
} satisfies Meta<typeof Bubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  render: () => (
    <BubbleGroup className="w-96 space-y-2">
      <Bubble>
        <BubbleContent>Hey — is the workspace backup done?</BubbleContent>
      </Bubble>
      <Bubble>
        <BubbleContent>Yes, finished two minutes ago.</BubbleContent>
      </Bubble>
    </BubbleGroup>
  ),
};
