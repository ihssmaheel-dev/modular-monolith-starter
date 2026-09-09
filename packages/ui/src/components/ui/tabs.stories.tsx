import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Tabs {...args} defaultValue="notes" className="w-96">
      <TabsList>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="notes">
        <p className="text-sm text-muted-foreground">Everything you captured.</p>
      </TabsContent>
      <TabsContent value="files">
        <p className="text-sm text-muted-foreground">Attachments live here.</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-sm text-muted-foreground">Workspace preferences.</p>
      </TabsContent>
    </Tabs>
  ),
};
