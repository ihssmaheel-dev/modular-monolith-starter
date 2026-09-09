import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { PageHeader, SectionHeader } from "./page-header";

const meta = {
  title: "Composed/PageHeader",
  component: PageHeader,
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Notes",
    description: "Everything you have captured, in one place.",
    actions: <Button size="sm">New note</Button>,
  },
};

export const WithoutActions: Story = {
  args: { title: "Settings" },
};

export const Section: Story = {
  args: { title: "Notification preferences" },
  render: () => (
    <SectionHeader
      title="Notification preferences"
      description="Choose how you want to be reached."
      actions={
        <Button variant="outline" size="sm">
          Reset
        </Button>
      }
    />
  ),
};
