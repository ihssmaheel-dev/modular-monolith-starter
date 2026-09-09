import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta = {
  title: "Primitives/Sheet",
  component: Sheet,
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Sheet {...args} defaultOpen>
      <SheetTrigger render={<Button variant="outline">Open filters</Button>} />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the notes list.</SheetDescription>
        </SheetHeader>
        <p className="px-4 text-sm text-muted-foreground">Filter controls go here.</p>
      </SheetContent>
    </Sheet>
  ),
};
