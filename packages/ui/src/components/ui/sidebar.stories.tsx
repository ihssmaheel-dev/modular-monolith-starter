import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

const meta = {
  title: "Primitives/Sidebar",
  component: SidebarProvider,
} satisfies Meta<typeof SidebarProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SidebarProvider className="h-96 rounded-lg border">
      <Sidebar>
        <SidebarHeader>
          <p className="px-2 text-sm font-semibold">Workspace</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>
                  <FileText />
                  Notes
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Settings />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 text-xs text-muted-foreground">v0.0.1</p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 p-3">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <p className="text-sm">Content area</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
};
