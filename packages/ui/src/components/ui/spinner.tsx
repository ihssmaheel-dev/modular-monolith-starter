import { cn } from "@repo/ui/lib/utils";
import { Loader2Icon } from "lucide-react";

function Spinner({
  className,
  "aria-label": ariaLabel = "Loading",
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={ariaLabel}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
