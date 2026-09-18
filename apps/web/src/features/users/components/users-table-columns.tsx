import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import type { DataTableColumn } from "@repo/ui/components/composed/data-table";
import type { UserResponse } from "@repo/contracts";
import { formatDate } from "@/lib/format";

export function getUsersColumns(t: (key: string) => string): DataTableColumn<UserResponse>[] {
  return [
    {
      key: "name",
      header: t("users.name"),
      cell: (row) => {
        const initials = row.name ? row.name.slice(0, 2).toUpperCase() : "U";
        return (
          <div className="flex items-center gap-2.5">
            <Avatar size="sm" className="size-7">
              <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs sm:text-sm font-medium text-foreground">{row.name}</span>
          </div>
        );
      },
    },
    {
      key: "email",
      header: t("users.email"),
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.email}</span>,
    },
    {
      key: "role",
      header: t("users.role"),
      cell: (row) => (
        <Badge
          variant={row.role === "admin" ? "default" : "secondary"}
          className="text-[10px] font-mono capitalize"
        >
          {row.role}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: t("users.created"),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
      className: "hidden sm:table-cell",
    },
  ];
}
