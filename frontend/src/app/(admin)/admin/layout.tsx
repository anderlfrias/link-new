"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { useRequireRole } from "@/features/auth/hooks/use-require-role";
import { ForbiddenScreen } from "@/features/admin/components/ForbiddenScreen";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useRequireRole(ADMIN_ROLE);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "checking" || status === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={28} />
      </div>
    );
  }

  if (status === "forbidden") {
    return <ForbiddenScreen />;
  }

  return <AdminShell>{children}</AdminShell>;
}
