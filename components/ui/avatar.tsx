import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-semibold text-white shadow-sm",
        className
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
