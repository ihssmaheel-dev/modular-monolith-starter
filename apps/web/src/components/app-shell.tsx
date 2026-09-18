import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@repo/ui/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-screen">
        <AppHeader />
        <main className="min-w-0 flex-1 bg-background px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="w-full space-y-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
