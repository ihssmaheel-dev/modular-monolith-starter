import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sparkles } from "lucide-react";
import { Marker, MarkerContent, MarkerIcon } from "./marker";

const meta = {
  title: "Primitives/Marker",
  component: Marker,
} satisfies Meta<typeof Marker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Marker {...args}>
      <MarkerIcon>
        <Sparkles />
      </MarkerIcon>
      <MarkerContent>AI summary ready</MarkerContent>
    </Marker>
  ),
};
