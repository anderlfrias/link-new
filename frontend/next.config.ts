import type { NextConfig } from "next";

// Next.js bloquea por defecto los requests a assets internos de dev
// (/_next/*, HMR) cuyo Origin/Referer no sea localhost — accesible solo
// por localhost o los hosts listados acá. Sin esto, entrar por la IP de la
// máquina en vez de "localhost" deja la página colgada en loading: el JS
// nunca termina de cargar porque esos chunks vuelven 403.
// Ver node_modules/next/dist/docs/.../allowedDevOrigins.md. Se configura por
// entorno (ej. NEXT_ALLOWED_DEV_ORIGINS=192.168.1.10 en .env.local, separados
// por coma, sin protocolo ni puerto) para no fijar la IP de ninguna máquina acá.
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Cabeceras de seguridad para todas las rutas. A propósito NO restringen de
// dónde salen scripts, estilos, imágenes o conexiones: la API, el socket y el
// almacenamiento S3 viven en orígenes que cambian con cada instalación, y
// Next.js usa scripts inline (ver app/layout.tsx), así que una CSP de fuentes
// exigiría nonces y renderizado dinámico. Lo que sí cubren:
// - frame-ancestors / X-Frame-Options: otro origen no puede embeber LINK en
//   un iframe (clickjacking).
// - base-uri, form-action, object-src: cierran vectores clásicos de inyección.
// - Permissions-Policy: cámara y micrófono solo para el propio origen
//   (llamadas, notas de voz, fotos); geolocalización apagada, no se usa.
// HSTS va en el reverse proxy que termina TLS, no acá: la app también corre
// por HTTP en dev o en una LAN (ver SECURITY.md).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
