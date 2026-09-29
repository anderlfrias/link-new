import { cn } from "@/utils/cn";

interface LogoProps {
  /** "icon" muestra solo el ícono; "full" agrega el wordmark "Link" al lado. */
  variant?: "icon" | "full";
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export function Logo({ variant = "full", className, iconClassName, textClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectorial, no pasa por el optimizador de next/image */}
      <img
        src="/brand/logo-mark.svg"
        alt="Link"
        width={570}
        height={395}
        className={cn("h-8 w-auto", iconClassName)}
      />
      {variant === "full" && (
        <span
          className={cn(
            "font-display text-2xl font-semibold leading-none text-brand-ink dark:text-white",
            textClassName,
          )}
        >
          Link
        </span>
      )}
    </span>
  );
}
