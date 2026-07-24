import { InputHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn } from "@/utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  rightElement?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, rightElement, error, ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3 flex text-neutral-400">{icon}</span>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-brand-ink outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/10 dark:bg-white/5 dark:text-white",
            icon && "pl-10",
            rightElement && "pr-10",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            className,
          )}
          {...props}
        />
        {rightElement && <span className="absolute right-3 flex">{rightElement}</span>}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});
