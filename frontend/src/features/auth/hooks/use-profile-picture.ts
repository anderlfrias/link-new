"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getProfilePicture } from "@/features/auth/api/auth.api";

/**
 * URL (blob local) de la foto de perfil del usuario logueado, traída de EXTERNAL_AUTH
 * a través del backend. `null` mientras carga, si no tiene foto, o si falló
 * — en ese caso `Avatar` cae solas a las iniciales.
 */
export function useProfilePicture(): string | null {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    getProfilePicture(session.token).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session]);

  return url;
}
