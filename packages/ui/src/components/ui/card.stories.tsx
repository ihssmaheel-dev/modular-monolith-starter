import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Primitives/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>Choose how you want to be reached.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Reset
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Channels, digest cadence, and quiet hours live here.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Save changes</Button>
      </CardFooter>
    </Card>
  ),
};

export const ContentOnly: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardContent className="pt-6">
        <p className="text-sm">A bare card for custom layouts.</p>
      </CardContent>
    </Card>
  ),
};
