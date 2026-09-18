"use client";

import * as React from "react";
import { cn } from "@repo/ui/lib/utils";

export function PageHeader({
  title,
  description,
  badge,
  eyebrow,
  actions,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-0.5",
        className,
      )}
      {...props}
    >
      <div className="space-y-0.5">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {eyebrow}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {badge && <div className="inline-flex items-center">{badge}</div>}
        </div>
        {description && <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-none">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
