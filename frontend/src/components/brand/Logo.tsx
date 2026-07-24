import Image from "next/image";
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
      <Image
        src="/brand/logo-mark.png"
        alt="Link"
        width={555}
        height={386}
        priority
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
