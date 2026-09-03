import rateLimit from "express-rate-limit";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Cloudflare siempre manda la IP real del visitante en `CF-Connecting-IP`, y
  // ese header no se puede falsificar desde el cliente (Cloudflare lo
  // sobreescribe en su borde) — usarlo acá evita depender de adivinar cuántos
  // saltos de proxy hay entre Cloudflare y este proceso (ver `trust proxy` en
  // app.ts, que igual hace falta para que `req.ip` — el fallback de acá, y lo
  // que usa morgan para loguear — también sea el real). Sin esto, todo el
  // tráfico detrás del mismo proxy comparte una sola IP a ojos de Express, y
  // este límite terminaba siendo compartido entre TODOS los usuarios en vez
  // de ser por persona — así se explica el "too many requests" en el primer
  // intento de alguien que nunca lo había hecho antes.
  keyGenerator: (req) => req.headers["cf-connecting-ip"]?.toString() ?? req.ip ?? "unknown",
  message: { error: "Hiciste demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar." },
});
