import env from "./env";

/// Convierte `CORS_ORIGIN` en lo que esperan `cors` y Socket.IO:
/// - lista separada por comas → solo esos orígenes exactos
///   (ej. "https://chat.example.com,https://otra.example.com");
/// - "*" → cualquier origen, a propósito;
/// - sin definir → cualquier origen. Solo puede pasar fuera de producción:
///   con NODE_ENV=production, env.ts no deja arrancar sin CORS_ORIGIN.
///
/// Centralizado acá porque la API HTTP (app.ts) y Socket.IO (socket/gateway.ts)
/// traen cada uno su propia config de CORS — sin esto, es fácil restringir uno
/// y dejar el otro abierto sin darse cuenta.
export function parseCorsOrigin(raw: string | undefined): string[] | true {
  if (!raw) return true;
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Una lista sin ningún origen válido (ej. ",") no abre nada: falla cerrado.
  return origins.includes("*") ? true : origins;
}

export const corsOrigin: string[] | true = parseCorsOrigin(env.CORS_ORIGIN);
