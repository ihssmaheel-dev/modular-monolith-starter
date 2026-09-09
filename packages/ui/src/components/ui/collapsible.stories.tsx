import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const meta = {
  title: "Primitives/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Collapsible {...args} defaultOpen className="w-96 space-y-2">
      <CollapsibleTrigger
        render={
          <Button variant="outline" size="sm">
            Advanced options
          </Button>
        }
      />
      <CollapsibleContent>
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          Retention window, purge schedule, and export format.
        </p>
      </CollapsibleContent>
    </Collapsible>
  ),
};
