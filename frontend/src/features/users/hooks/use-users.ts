"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { listUsers } from "@/features/users/api/users.api";
import type { DirectoryUser } from "@/features/users/types/user.types";

export type UsersStatus = "idle" | "loading" | "ready" | "error";

/** Directorio completo (sin `search`) — el filtro por texto se hace en el cliente,
 * igual que en useConversations, ya que se espera una organización chica. */
export function useUsers(enabled: boolean) {
  const { session } = useAuth();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [status, setStatus] = useState<UsersStatus>("idle");

  useEffect(() => {
    if (!enabled || !session) return;
    setStatus("loading");
    listUsers(session.token)
      .then((data) => {
        setUsers(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [enabled, session]);

  return { users, status };
}
