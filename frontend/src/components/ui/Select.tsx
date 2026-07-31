import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/utils/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-brand-ink outline-none transition-colors focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/10 dark:bg-white/5 dark:text-white",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});
