"use client";

import { Settings2 } from "lucide-react";
import type { ReactTable, RowData } from "@tanstack/react-table";

import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { DataTableFeatures } from "./data-table-features";

type DataTableViewOptionsProps<TData extends RowData> = {
  table: ReactTable<DataTableFeatures, TData>;
  label?: string;
  title?: string;
};

export function DataTableViewOptions<TData extends RowData>({
  table,
  label = "Columns",
  title = "Toggle columns",
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="ml-auto hidden h-7 gap-1.5 text-xs lg:flex"
          >
            <Settings2 className="size-3.5" />
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.accessorFn !== undefined && column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
