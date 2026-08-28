import env from "./env";

/// `CORS_ORIGIN` sin definir → sin restricción (cómodo en dev/LAN, cualquier
/// origen). Definida → lista separada por comas de orígenes exactos
/// permitidos (ej. "https://link.example.org,https://otra.app").
///
/// Centralizado acá porque la API HTTP (app.ts) y Socket.IO (socket/gateway.ts)
/// traen cada uno su propia config de CORS — sin esto, es fácil restringir uno
/// y dejar el otro abierto sin darse cuenta.
export const corsOrigin: string[] | true = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : true;
