import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { loginIpRateLimiter, loginUserRateLimiter } from "./rate-limit.middleware";

const TOO_MANY_ATTEMPTS_BODY = {
  error: "Hiciste demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.",
};

// skipSuccessfulRequests: true (ver rate-limit.middleware.ts) hace que una
// respuesta 2xx NO sume contra el cupo — por eso el handler de prueba
// devuelve 401 (simula "credenciales incorrectas"): si devolviera 200 el
// contador nunca avanzaría y estos tests nunca verían un 429.
function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(limiter);
  app.post("/login", (_req, res) => res.status(401).json({ error: "bad credentials" }));
  return app;
}

// loginIpRateLimiter/loginUserRateLimiter son instancias únicas compartidas
// entre tests (se crean una sola vez al importar el módulo) — cada test usa
// una key distinta (usuario/IP) para no pisarse el cupo entre sí.
let uniqueSuffix = 0;
function uniqueKey(prefix: string): string {
  uniqueSuffix += 1;
  return `${prefix}-${uniqueSuffix}`;
}

describe("loginUserRateLimiter", () => {
  it("permite 5 intentos fallidos por usuario y bloquea el 6to con el mensaje esperado", async () => {
    const app = buildApp(loginUserRateLimiter);
    const user = uniqueKey("user");

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/login").send({ user });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").send({ user });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY_ATTEMPTS_BODY);
  });

  it("dos usuarios distintos tienen cupos independientes", async () => {
    const app = buildApp(loginUserRateLimiter);
    const userA = uniqueKey("userA");
    const userB = uniqueKey("userB");

    for (let i = 0; i < 5; i++) {
      await request(app).post("/login").send({ user: userA });
    }

    const res = await request(app).post("/login").send({ user: userB });
    expect(res.status).toBe(401);
  });

  it("normaliza mayúsculas y espacios del usuario al mismo cupo", async () => {
    const app = buildApp(loginUserRateLimiter);
    const base = uniqueKey("normuser");

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/login")
        .send({ user: `  ${base.toUpperCase()}  ` });
    }

    // Mismo usuario, normalizado distinto (trim + lowercase en el código) -> mismo bucket.
    const blocked = await request(app).post("/login").send({ user: base.toLowerCase() });
    expect(blocked.status).toBe(429);
  });

  it("sin `user` en el body (o no-string) cae en el bucket genérico compartido", async () => {
    const app = buildApp(loginUserRateLimiter);

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/login").send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").send({ user: 12345 });
    expect(blocked.status).toBe(429);
  });
});

describe("loginIpRateLimiter", () => {
  it("permite 20 intentos fallidos por IP (cf-connecting-ip) y bloquea el 21ro", async () => {
    const app = buildApp(loginIpRateLimiter);
    const ip = uniqueKey("203.0.113");

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/login").set("cf-connecting-ip", ip).send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", ip).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY_ATTEMPTS_BODY);
  });

  it("dos IPs distintas en cf-connecting-ip tienen cupos independientes", async () => {
    const app = buildApp(loginIpRateLimiter);
    const ipA = uniqueKey("198.51.100");
    const ipB = uniqueKey("198.51.100");

    for (let i = 0; i < 20; i++) {
      await request(app).post("/login").set("cf-connecting-ip", ipA).send({});
    }

    const res = await request(app).post("/login").set("cf-connecting-ip", ipB).send({});
    expect(res.status).toBe(401);
  });

  it("sin header cf-connecting-ip cae a req.ip como fallback y sigue limitando", async () => {
    const app = buildApp(loginIpRateLimiter);

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/login").send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").send({});
    expect(blocked.status).toBe(429);
  });
});
