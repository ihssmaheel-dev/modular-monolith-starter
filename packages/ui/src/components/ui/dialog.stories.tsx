import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Dialog {...args} defaultOpen>
      <DialogTrigger render={<Button variant="outline">Share note</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share note</DialogTitle>
          <DialogDescription>Anyone with the link can view this note.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="story-link">Link</Label>
          <Input id="story-link" readOnly defaultValue="https://app.example/notes/n-1" />
        </div>
        <DialogFooter>
          <Button>Copy link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
