import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js bloquea por defecto los requests a assets internos de dev
  // (/_next/*, HMR) cuyo Origin/Referer no sea localhost — accesible solo
  // por localhost o los hosts listados acá. Sin esto, entrar por la IP de la
  // máquina en vez de "localhost" deja la página colgada en loading: el JS
  // nunca termina de cargar porque esos chunks vuelven 403.
  // Ver node_modules/next/dist/docs/.../allowedDevOrigins.md — coincidir con
  // el host (sin protocolo/puerto) que usás en NEXT_PUBLIC_API_URL (.env.local).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
