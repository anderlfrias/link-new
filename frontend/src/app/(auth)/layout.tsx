"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-blue-light/10 via-white to-brand-teal-light/10 dark:from-brand-blue-dark/20 dark:via-neutral-950 dark:to-brand-teal-dark/10">
      <ThemeToggle className="absolute top-4 right-4" />
      {children}
    </div>
  );
}
