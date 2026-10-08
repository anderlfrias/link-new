import { getLogger } from "../config/request-context";
import { findProviderUsersWithoutAvatar, upsertExternalUser } from "../modules/auth/auth.repository";
import { setAvatarFromProvider } from "../modules/auth/auth.service";
import type { ProviderContext } from "./api";

/// Lo único de LINK que ve un proveedor (ver `api.ts`). Es de un proveedor
/// concreto: lo que guarda lo marca con su `id`. El id puede ser una función, para el
/// contexto que recibe `createAuthProvider` antes de que el proveedor exista: se
/// resuelve recién cuando se lo usa (ver `loader.ts`).
export function createProviderContext(provider: string | (() => string)): ProviderContext {
  const providerId = () => (typeof provider === "string" ? provider : provider());
  return {
    // `getLogger()` en cada llamada, no una sola vez: así cada línea lleva el
    // contexto de la request que la originó, o el logger raíz en segundo plano.
    logger: {
      debug: (fields, message) => getLogger().debug(fields, message),
      info: (fields, message) => getLogger().info(fields, message),
      warn: (fields, message) => getLogger().warn(fields, message),
      error: (fields, message) => getLogger().error(fields, message),
    },
    users: {
      async upsertExternalUser(user) {
        const saved = await upsertExternalUser(providerId(), user);
        return { userId: saved.id };
      },
      setAvatarFromProvider,
      async listWithoutAvatar() {
        const users = await findProviderUsersWithoutAvatar(providerId());
        return users.map(({ id, username, externalId }) => ({ userId: id, username, externalId }));
      },
    },
  };
}
