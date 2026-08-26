import { InputHTMLAttributes, ReactNode, forwardRef } from "react";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/utils/cn";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, ...props },
  ref,
) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300", className)}>
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          className="peer h-4 w-4 shrink-0 appearance-none rounded border border-black/10 bg-white transition-colors checked:border-brand-blue checked:bg-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 dark:border-white/10 dark:bg-white/5"
          {...props}
        />
        <IconCheck
          size={12}
          stroke={3}
          className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
});
