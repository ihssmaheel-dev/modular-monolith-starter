import { createColumnHelper } from "@tanstack/react-table";
import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import { DataTableColumnHeader } from "@repo/ui/components/composed/data-table";
import type { DataTableColumn, DataTableFeatures } from "@repo/ui/components/composed/data-table";
import type { UserResponse } from "@repo/contracts";
import { formatDate } from "@/lib/format";

const columnHelper = createColumnHelper<DataTableFeatures, UserResponse>();

export function getUsersColumns(t: (key: string) => string): DataTableColumn<UserResponse>[] {
  return columnHelper.columns([
    columnHelper.accessor("name", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("users.name")} />,
      cell: (info) => {
        const name = info.getValue();
        const initials = name ? name.slice(0, 2).toUpperCase() : "U";
        return (
          <div className="flex items-center gap-2.5">
            <Avatar size="sm" className="size-7">
              <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs sm:text-sm font-medium text-foreground">{name}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("email", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("users.email")} />,
      cell: (info) => (
        <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("role", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("users.role")} />,
      cell: (info) => {
        const role = info.getValue();
        return (
          <Badge
            variant={role === "admin" ? "default" : "secondary"}
            className="text-[10px] font-mono capitalize"
          >
            {role}
          </Badge>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor("createdAt", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("users.created")} />,
      cell: (info) => (
        <span className="text-xs text-muted-foreground">{formatDate(info.getValue())}</span>
      ),
      meta: { className: "hidden sm:table-cell" },
    }),
  ]);
}
