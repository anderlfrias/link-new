import rateLimit from "express-rate-limit";
import { getClientIp } from "../config/client-ip";

const WINDOW_MS = 15 * 60 * 1000;
/// También lo usa el bloqueo por cuenta del modo local (LOCAL_AUTH_PLAN.md,
/// D17): una cuenta bloqueada responde exactamente lo mismo que este rate
/// limit, así no se confirma que la cuenta existe.
export const TOO_MANY_ATTEMPTS_MESSAGE = {
  error: "Hiciste demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.",
};

// La IP sale de `getClientIp` (config/client-ip.ts): `req.ip` según
// TRUST_PROXY, o `CF-Connecting-IP` solo si TRUST_CF_CONNECTING_IP=true. Esa
// cabecera no se puede falsificar cuando todo el tráfico pasa por Cloudflare
// (la sobreescribe en su borde), pero sin Cloudflare delante cualquier
// cliente la manda con la IP que quiera y se saltaba este límite.
//
// Tres limiters en paralelo, no uno solo:
//
// - `loginIpRateLimiter` (por IP, 20): frena a quien prueba muchos usuarios
//   distintos desde una sola IP (fuerza bruta clásica). Si fuera el único
//   límite, todo el tráfico detrás del mismo proxy/NAT (oficina, CGNAT)
//   compartiría una sola IP a ojos de Express y el cupo sería de TODOS en vez de
//   por persona — así se explicó un "too many requests" en el primer intento de
//   alguien que nunca lo había hecho: OTRA persona en la misma red ya había
//   gastado el cupo compartido.
// - `loginUserIpRateLimiter` (por usuario + IP, 5): es el cupo que importa para
//   una persona. Cada combinación de cuenta e IP tiene el suyo, así que los
//   fallos de alguien que escribe el usuario ajeno desde su IP gastan SU cupo
//   y no el de la víctima, que entra sin problema desde otra IP.
// - `loginUserRateLimiter` (por usuario, 20, desde cualquier IP): tope global
//   por cuenta contra la fuerza bruta distribuida. Con el mismo límite de 5 que
//   el de arriba, cualquiera sin cuenta —mandando 5 intentos con el usuario de
//   otra persona cada 15 minutos— le impedía entrar todo el día: este cupo se
//   agotaba aunque la contraseña correcta estuviera en camino. Con 20, para
//   bloquear una cuenta en todas las IPs hacen falta al menos 4 IPs distintas
//   (20 / 5), y la capacidad de adivinar una contraseña sube de 5 a 20
//   intentos cada 15 minutos, que sigue siendo poco. El bloqueo persistente por
//   cuenta del modo local (LOCAL_AUTH_PLAN.md, D17) es aparte y está apagado
//   por defecto.
//
// Detrás de un NAT, o con TRUST_PROXY mal configurado, todos comparten IP y el
// límite por usuario + IP se degrada al comportamiento de antes.
//
// `skipSuccessfulRequests: true` en los tres: un login que sale bien no debería
// sumar contra el límite, incluso si antes hubo algún typo — así el cupo solo
// se gasta con fallos reales, no con el uso normal de alguien reintentando.

export const loginIpRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => getClientIp(req) ?? "unknown",
  message: TOO_MANY_ATTEMPTS_MESSAGE,
});

// Sin `user` en el body (o con un tipo raro) todos esos intentos caen en un
// mismo bucket compartido genérico — no hace falta más precisión ahí: ya
// quedan cubiertos por `loginIpRateLimiter` de todos modos, y un `user`
// faltante de por sí corta enseguida en el controller con `BadRequestError`.
const UNKNOWN_USER_KEY = "unknown-user";

/// El usuario que se intenta loguear (usuario o correo), normalizado como lo
/// hace el login: sin espacios en los bordes y sin distinguir mayúsculas.
function loginUserKey(req: { body?: { user?: unknown } }): string {
  const user = req.body?.user;
  return typeof user === "string" && user.trim() ? user.trim().toLowerCase() : UNKNOWN_USER_KEY;
}

/// `PATCH /auth/password` (LOCAL_AUTH_PLAN.md §7): por cuenta, para que un
/// token robado no sirva para probar contraseñas actuales por fuerza bruta.
/// Mismo cupo que el login por usuario; solo cuentan los intentos fallidos.
export const passwordChangeRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.internalUserId ?? getClientIp(req) ?? "unknown",
  message: { error: "Hiciste demasiados intentos de cambio de contraseña. Esperá unos minutos y volvé a intentar." },
});

export const loginUserIpRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${loginUserKey(req)}|${getClientIp(req) ?? "unknown"}`,
  message: TOO_MANY_ATTEMPTS_MESSAGE,
});

export const loginUserRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginUserKey,
  message: TOO_MANY_ATTEMPTS_MESSAGE,
});

// Antes de que exista el upload chunked (ver LARGE_FILES_PLAN.md, Fase 4+),
// este es el único freno contra un usuario autenticado que abre muchas
// subidas seguidas para agotar memoria/disco (ese plan, S5 y S14) — hasta
// ahora `POST /v1/files` no tenía ningún límite propio, solo el techo fijo
// de tamaño de multer (`file.route.ts`). Por usuario (`internalUserId`), no
// por IP: varias personas subiendo desde la misma oficina/CGNAT no deben
// compartir un único cupo (mismo razonamiento que `loginUserRateLimiter`
// arriba). A diferencia de los limiters de login, NO usa
// `skipSuccessfulRequests`: acá una subida exitosa es exactamente el costo
// de recurso (memoria/disco) que se quiere acotar, así que también gasta
// cupo, no solo los fallos.
export const uploadRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.internalUserId ?? getClientIp(req) ?? "unknown",
  message: { error: "Hiciste demasiadas subidas de archivos. Esperá unos minutos y volvé a intentar." },
});

// Rate limiter para el pedido de URLs presignadas de partes (LARGE_FILES_PLAN.md S8).
// Presignar es liviano para Link pero pedir miles de URLs puede ser usado como amplificador DoS.
// Con lotes de 20 partes (8 MiB cada una), 120 requests cubren ~19 GB en 15 minutos para un usuario legítimo.
export const partUrlsRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.internalUserId ?? getClientIp(req) ?? "unknown",
  message: { error: "Demasiadas solicitudes de URLs de subida. Esperá unos minutos y volvé a intentar." },
});

// Rate limiter para descarga y visualización de archivos (LARGE_FILES_PLAN.md S5/S8).
// Evita raspado o abuso masivo de ancho de banda sirviendo archivos adjuntos.
// 300 peticiones por ventana de 15 minutos por usuario o IP es holgado para navegación interactiva regular.
export const downloadRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.internalUserId ?? getClientIp(req) ?? "unknown",
  message: { error: "Demasiadas solicitudes de descarga de archivos. Esperá unos minutos y volvé a intentar." },
});

