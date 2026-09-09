import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args} className="w-96">
      <TriangleAlert />
      <AlertTitle>Export is ready</AlertTitle>
      <AlertDescription>Your data export finished and is available for 7 days.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          Download
        </Button>
      </AlertAction>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: (args) => (
    <Alert {...args} variant="destructive" className="w-96">
      <TriangleAlert />
      <AlertTitle>Upload failed</AlertTitle>
      <AlertDescription>Storage quota exceeded. Free up space and retry.</AlertDescription>
    </Alert>
  ),
};
