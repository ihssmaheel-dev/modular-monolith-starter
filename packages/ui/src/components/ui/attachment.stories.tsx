import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText } from "lucide-react";
import { Button } from "./button";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./attachment";

const meta = {
  title: "Primitives/Attachment",
  component: Attachment,
} satisfies Meta<typeof Attachment>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {
  render: (args) => (
    <AttachmentGroup className="w-96">
      <Attachment {...args} state="done">
        <AttachmentMedia>
          <FileText />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>launch-checklist.pdf</AttachmentTitle>
          <AttachmentDescription>1.2 MB · Uploaded</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <Button variant="ghost" size="sm">
            Remove
          </Button>
        </AttachmentActions>
      </Attachment>
    </AttachmentGroup>
  ),
};

export const Failed: Story = {
  render: (args) => (
    <AttachmentGroup className="w-96">
      <Attachment {...args} state="error">
        <AttachmentMedia>
          <FileText />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>huge-video.mp4</AttachmentTitle>
          <AttachmentDescription>File exceeds the allowed size</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions>
          <Button variant="ghost" size="sm">
            Retry
          </Button>
        </AttachmentActions>
      </Attachment>
    </AttachmentGroup>
  ),
};
