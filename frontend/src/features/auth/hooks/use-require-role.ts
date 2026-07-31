"use client";

import { useAuth } from "@/providers/auth-provider";
import type { Session } from "@/features/auth/types/auth.types";

export type RoleGateStatus = "checking" | "authorized" | "unauthenticated" | "forbidden";

/** Gate de acceso por rol, mismo criterio que el chequeo de autenticación de
 * `(chat)/layout.tsx`: mientras la sesión no resolvió todavía es "checking",
 * sin sesión es "unauthenticated" (quien llama decide qué hacer — ej.
 * redirigir a /login), y con sesión pero sin el rol pedido es "forbidden". */
export function useRequireRole(role: string): { status: RoleGateStatus; session: Session | null } {
  const { session, status: authStatus } = useAuth();

  if (authStatus === "idle") {
    return { status: "checking", session: null };
  }
  if (authStatus === "unauthenticated" || !session) {
    return { status: "unauthenticated", session: null };
  }
  if (!session.user.roles.includes(role)) {
    return { status: "forbidden", session };
  }
  return { status: "authorized", session };
}
