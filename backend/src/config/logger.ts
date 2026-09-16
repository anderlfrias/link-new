import pino from "pino";
import env from "./env";

/// Único logger de la aplicación. Todo el backend loguea a través de `logger`
/// o de un child suyo — nunca con `console.*` (ver `src/no-console.test.ts`,
/// que falla si aparece uno nuevo).
///
/// Sale por **stdout** a propósito: en producción PM2 es el que escribe y rota
/// los archivos (ver `ecosystem.config.js`). El proceso no decide dónde vive su
/// log — si alguna vez se quiere mandar a un agregador, se conecta ahí sin
/// tocar este archivo.

/// Campos que NUNCA deben aparecer en un log, por más que alguien loguee el
/// objeto entero que los contiene. Es defensa estructural: no depende de que
/// cada call site se acuerde de omitirlos.
///
/// OJO — `redact` solo actúa sobre propiedades de objetos. Una string ya
/// interpolada (`logger.info(\`token: ${t}\`)`) pasa intacta: eso se previene
/// con las reglas de LOGGING_PLAN.md §4, no con esto.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
];

/// Factory separada del singleton para que los tests puedan construir un logger
/// con destino y nivel propios y assertear sobre la salida real (el singleton
/// está en `silent` durante los tests, ver vitest.config.ts).
export function buildLogger(opts?: { level?: string; destination?: pino.DestinationStream }) {
  const isTest = process.env.NODE_ENV === "test";
  const level = opts?.level ?? (isTest ? "silent" : env.LOG_LEVEL);

  // pino-pretty corre en un worker thread. Bajo vitest eso deja handles
  // abiertos y el runner no termina nunca — de ahí el guard de isTest, además
  // del destino explícito que pasan los tests.
  const usePretty = env.LOG_PRETTY && !isTest && !opts?.destination;

  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
      // ISO-8601 en vez del epoch default de pino: estos logs también los lee
      // gente. Ver `time: false` en ecosystem.config.js — PM2 no debe prefijar
      // su propio timestamp o rompe el JSON por línea.
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(usePretty
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    opts?.destination,
  );
}

export const logger = buildLogger();
