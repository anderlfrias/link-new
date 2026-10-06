import rateLimit from "express-rate-limit";
import { getClientIp } from "../config/client-ip";

const WINDOW_MS = 15 * 60 * 1000;
const TOO_MANY_ATTEMPTS_MESSAGE = {
  error: "Hiciste demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.",
};

// La IP sale de `getClientIp` (config/client-ip.ts): `req.ip` según
// TRUST_PROXY, o `CF-Connecting-IP` solo si TRUST_CF_CONNECTING_IP=true. Esa
// cabecera no se puede falsificar cuando todo el tráfico pasa por Cloudflare
// (la sobreescribe en su borde), pero sin Cloudflare delante cualquier
// cliente la manda con la IP que quiera y se saltaba este límite.
//
// Dos limiters en paralelo, no uno solo: si el único límite fuera por IP,
// todo el tráfico detrás del mismo proxy/NAT (oficina, CGNAT) comparte una
// sola IP a ojos de Express, y el límite terminaba siendo compartido entre
// TODOS los usuarios en vez de ser por persona — así se explicaba el "too
// many requests" en el primer intento de alguien que nunca lo había hecho
// antes: OTRA persona en la misma red ya había gastado el cupo compartido.
//
// `loginUserRateLimiter` (por usuario) es la defensa real para ese caso: cada
// cuenta tiene su propio cupo, así que los intentos fallidos de un usuario
// nunca afectan a otro que comparte la misma IP. `loginIpRateLimiter` (por IP)
// se mantiene como respaldo más amplio, para frenar a quien prueba muchos
// usuarios distintos desde una sola IP (fuerza bruta clásica) — con más cupo
// porque ya no es la única línea de defensa.
//
// `skipSuccessfulRequests: true` en ambos: un login que sale bien no debería
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

export const loginUserRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const user = req.body?.user;
    return typeof user === "string" && user.trim() ? user.trim().toLowerCase() : UNKNOWN_USER_KEY;
  },
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

