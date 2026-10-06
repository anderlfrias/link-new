"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getProfilePicture } from "@/features/auth/api/auth.api";

interface ProfilePictureContextValue {
  /** URL (blob local) de mi foto de perfil, o `null` mientras carga / si no tengo / si falló. */
  url: string | null;
  /** Volver a pedirla — llamarlo después de subir/borrar para que todo lo que la muestre se entere. */
  refresh: () => void;
}

const ProfilePictureContext = createContext<ProfilePictureContextValue | null>(null);

/**
 * Estado compartido de mi propia foto de perfil, servida por el backend (en
 * modo external-auth, sincronizada desde EXTERNAL_AUTH al iniciar sesión). Vive en un Provider — no en un hook local — porque más de un
 * componente la muestra a la vez (`UserMenu`, el panel de perfil) y todos
 * necesitan enterarse en el momento en que cambia, no cada uno con su propio
 * fetch independiente desincronizado del resto.
 */
export function ProfilePictureProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!session) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    getProfilePicture(session.token)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `version` no se lee adentro — solo fuerza el refetch de `refresh()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, version]);

  const refresh = useCallback(() => setVersion((prev) => prev + 1), []);

  return <ProfilePictureContext.Provider value={{ url, refresh }}>{children}</ProfilePictureContext.Provider>;
}

export function useProfilePicture(): ProfilePictureContextValue {
  const context = useContext(ProfilePictureContext);
  if (!context) {
    throw new Error("useProfilePicture debe usarse dentro de <ProfilePictureProvider>");
  }
  return context;
}
