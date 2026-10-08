import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import env from "../config/env";
import {
  downloadRateLimiter,
  loginIpRateLimiter,
  loginUserIpRateLimiter,
  loginUserRateLimiter,
  messageSendRateLimiter,
  partUrlsRateLimiter,
  uploadRateLimiter,
} from "./rate-limit.middleware";

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

// Las pruebas que cambian de IP lo hacen con cf-connecting-ip, que solo se
// respeta con TRUST_CF_CONNECTING_IP=true (ver config/client-ip.ts).
function withCloudflareIp() {
  const originalTrustCf = env.TRUST_CF_CONNECTING_IP;
  beforeEach(() => {
    env.TRUST_CF_CONNECTING_IP = true;
  });
  afterEach(() => {
    env.TRUST_CF_CONNECTING_IP = originalTrustCf;
  });
}

describe("loginUserIpRateLimiter", () => {
  withCloudflareIp();

  it("bloquea el 6to fallo del mismo usuario desde la misma IP", async () => {
    const app = buildApp(loginUserIpRateLimiter);
    const user = uniqueKey("user");
    const ip = uniqueKey("203.0.113");

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/login").set("cf-connecting-ip", ip).send({ user });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", ip).send({ user });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY_ATTEMPTS_BODY);
  });

  it("el mismo usuario desde otra IP conserva su cupo", async () => {
    const app = buildApp(loginUserIpRateLimiter);
    const user = uniqueKey("user");
    const attackerIp = uniqueKey("203.0.113");
    const ownerIp = uniqueKey("198.51.100");

    for (let i = 0; i < 6; i++) {
      await request(app).post("/login").set("cf-connecting-ip", attackerIp).send({ user });
    }
    const attacker = await request(app).post("/login").set("cf-connecting-ip", attackerIp).send({ user });
    expect(attacker.status).toBe(429);

    // El titular de la cuenta entra desde su propia IP: el atacante solo agotó su cupo.
    const owner = await request(app).post("/login").set("cf-connecting-ip", ownerIp).send({ user });
    expect(owner.status).toBe(401);
  });

  it("otro usuario desde la misma IP tiene su propio cupo", async () => {
    const app = buildApp(loginUserIpRateLimiter);
    const ip = uniqueKey("203.0.113");
    const userA = uniqueKey("userA");
    const userB = uniqueKey("userB");

    for (let i = 0; i < 6; i++) {
      await request(app).post("/login").set("cf-connecting-ip", ip).send({ user: userA });
    }

    const res = await request(app).post("/login").set("cf-connecting-ip", ip).send({ user: userB });
    expect(res.status).toBe(401);
  });

  it("normaliza mayúsculas y espacios del usuario", async () => {
    const app = buildApp(loginUserIpRateLimiter);
    const base = uniqueKey("normuser");
    const ip = uniqueKey("203.0.113");

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/login")
        .set("cf-connecting-ip", ip)
        .send({ user: `  ${base.toUpperCase()}  ` });
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", ip).send({ user: base.toLowerCase() });
    expect(blocked.status).toBe(429);
  });

  it("sin `user` en el body se limita por IP en un bucket genérico", async () => {
    const app = buildApp(loginUserIpRateLimiter);
    const ip = uniqueKey("203.0.113");

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/login").set("cf-connecting-ip", ip).send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", ip).send({ user: 12345 });
    expect(blocked.status).toBe(429);
  });
});

describe("loginUserRateLimiter", () => {
  withCloudflareIp();

  it("permite 20 fallos por usuario desde IPs distintas y bloquea el 21ro", async () => {
    const app = buildApp(loginUserRateLimiter);
    const user = uniqueKey("user");

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/login").set("cf-connecting-ip", uniqueKey("192.0.2")).send({ user });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", uniqueKey("192.0.2")).send({ user });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY_ATTEMPTS_BODY);
  });

  it("cinco fallos de una sola IP no agotan el cupo del usuario", async () => {
    const app = express();
    app.use(express.json());
    // La cadena completa de /auth/login: por usuario + IP y, después, el tope global por usuario.
    app.use(loginUserIpRateLimiter, loginUserRateLimiter);
    app.post("/login", (_req, res) => res.status(401).json({ error: "bad credentials" }));
    const user = uniqueKey("user");
    const attackerIp = uniqueKey("203.0.113");
    const ownerIp = uniqueKey("198.51.100");

    for (let i = 0; i < 7; i++) {
      await request(app).post("/login").set("cf-connecting-ip", attackerIp).send({ user });
    }

    // El titular no recibe 429 aunque el atacante ya agotó su cupo usuario+IP.
    const owner = await request(app).post("/login").set("cf-connecting-ip", ownerIp).send({ user });
    expect(owner.status).toBe(401);
  });

  it("dos usuarios distintos tienen cupos independientes", async () => {
    const app = buildApp(loginUserRateLimiter);
    const userA = uniqueKey("userA");
    const userB = uniqueKey("userB");

    for (let i = 0; i < 20; i++) {
      await request(app).post("/login").send({ user: userA });
    }

    const res = await request(app).post("/login").send({ user: userB });
    expect(res.status).toBe(401);
  });

  it("normaliza mayúsculas y espacios del usuario al mismo cupo", async () => {
    const app = buildApp(loginUserRateLimiter);
    const base = uniqueKey("normuser");

    for (let i = 0; i < 20; i++) {
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

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/login").send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").send({ user: 12345 });
    expect(blocked.status).toBe(429);
  });
});

describe("loginIpRateLimiter", () => {
  // Las pruebas con cf-connecting-ip simulan una instalación detrás de
  // Cloudflare (TRUST_CF_CONNECTING_IP=true, ver config/client-ip.ts).
  const originalTrustCf = env.TRUST_CF_CONNECTING_IP;

  beforeEach(() => {
    env.TRUST_CF_CONNECTING_IP = true;
  });

  afterEach(() => {
    env.TRUST_CF_CONNECTING_IP = originalTrustCf;
  });

  it("sin TRUST_CF_CONNECTING_IP, cambiar cf-connecting-ip en cada intento no da cupo nuevo", async () => {
    env.TRUST_CF_CONNECTING_IP = false;
    let fakeIp = 0;
    const app = express();
    app.use(express.json());
    // req.ip fijo y propio de este test: el limiter es una instancia compartida
    // y el test de fallback de abajo ya gasta el cupo de la IP de supertest.
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: "192.0.2.50" });
      next();
    });
    app.use(loginIpRateLimiter);
    app.post("/login", (_req, res) => res.status(401).json({ error: "bad credentials" }));

    for (let i = 0; i < 20; i++) {
      fakeIp += 1;
      const res = await request(app).post("/login").set("cf-connecting-ip", `203.0.113.${fakeIp}`).send({});
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post("/login").set("cf-connecting-ip", "203.0.113.250").send({});
    expect(blocked.status).toBe(429);
  });

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

// A diferencia de buildApp(...) de arriba, este inyecta req.user a partir de
// un header que solo el test controla (no hay JWT real acá) y responde 201:
// uploadRateLimiter NO usa skipSuccessfulRequests (ver rate-limit.middleware.ts),
// así que hay que probar que un 2xx también gasta cupo, no solo los fallos.
function buildUploadApp() {
  const app = express();
  app.use((req, _res, next) => {
    const userId = req.headers["x-test-user-id"];
    if (typeof userId === "string") {
      req.user = { id: "ext", email: "u@test.com", roles: [], internalUserId: userId } as any;
    }
    next();
  });
  app.use(uploadRateLimiter);
  app.post("/upload", (_req, res) => res.status(201).json({ ok: true }));
  return app;
}

describe("messageSendRateLimiter", () => {
  // Como `buildApp`, pero el handler responde 201 (un envío exitoso): el limiter NO
  // usa skipSuccessfulRequests, así que igual tiene que gastar cupo.
  function buildSendApp(userId: string | undefined) {
    const app = express();
    app.use((req, _res, next) => {
      if (userId) req.user = { internalUserId: userId } as any;
      next();
    });
    app.use(messageSendRateLimiter);
    app.post("/messages", (_req, res) => res.status(201).json({ ok: true }));
    return app;
  }

  it("permite 120 envíos por minuto por usuario y bloquea el 121", async () => {
    const app = buildSendApp(uniqueKey("sender"));

    for (let i = 0; i < 120; i++) {
      const res = await request(app).post("/messages").send({});
      expect(res.status).toBe(201);
    }

    const blocked = await request(app).post("/messages").send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "Estás enviando mensajes demasiado rápido. Esperá un momento y volvé a intentar.",
    });
  });

  it("usuarios distintos tienen cupos independientes", async () => {
    const appA = buildSendApp(uniqueKey("senderA"));
    const appB = buildSendApp(uniqueKey("senderB"));

    for (let i = 0; i < 121; i++) {
      await request(appA).post("/messages").send({});
    }

    const res = await request(appB).post("/messages").send({});
    expect(res.status).toBe(201);
  });

  it("sin usuario autenticado cae al fallback de IP y sigue limitando", async () => {
    const app = express();
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: "192.0.2.99" });
      next();
    });
    app.use(messageSendRateLimiter);
    app.post("/messages", (_req, res) => res.status(201).json({ ok: true }));

    for (let i = 0; i < 120; i++) {
      await request(app).post("/messages").send({});
    }

    const blocked = await request(app).post("/messages").send({});
    expect(blocked.status).toBe(429);
  });
});

describe("uploadRateLimiter", () => {
  it("permite 60 subidas por usuario y bloquea la 61ra con el mensaje esperado", async () => {
    const app = buildUploadApp();
    const userId = uniqueKey("upload-user");

    for (let i = 0; i < 60; i++) {
      const res = await request(app).post("/upload").set("x-test-user-id", userId);
      expect(res.status).toBe(201);
    }

    const blocked = await request(app).post("/upload").set("x-test-user-id", userId);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "Hiciste demasiadas subidas de archivos. Esperá unos minutos y volvé a intentar.",
    });
  }, 20000);

  it("dos usuarios distintos tienen cupos independientes", async () => {
    const app = buildUploadApp();
    const userA = uniqueKey("upload-a");
    const userB = uniqueKey("upload-b");

    for (let i = 0; i < 60; i++) {
      await request(app).post("/upload").set("x-test-user-id", userA);
    }

    const res = await request(app).post("/upload").set("x-test-user-id", userB);
    expect(res.status).toBe(201);
  }, 20000);

  it("las subidas exitosas SÍ gastan cupo (a diferencia de los limiters de login)", async () => {
    const app = buildUploadApp();
    const userId = uniqueKey("upload-counts-success");

    const first = await request(app).post("/upload").set("x-test-user-id", userId);
    expect(first.status).toBe(201);
    expect(first.headers["ratelimit-remaining"]).toBe("59");
  });

  it("sin usuario autenticado cae al fallback de IP y sigue limitando", async () => {
    const app = buildUploadApp();

    for (let i = 0; i < 60; i++) {
      const res = await request(app).post("/upload");
      expect(res.status).toBe(201);
    }

    const blocked = await request(app).post("/upload");
    expect(blocked.status).toBe(429);
  }, 20000);
});

describe("partUrlsRateLimiter", () => {
  function buildPartUrlsApp() {
    const app = express();
    app.use((req, _res, next) => {
      const headerUser = req.headers["x-test-user-id"];
      if (typeof headerUser === "string") {
        (req as any).user = { internalUserId: headerUser };
      }
      next();
    });
    app.use(partUrlsRateLimiter);
    app.post("/part-urls", (_req, res) => res.status(200).json({ urls: [] }));
    return app;
  }

  it("permite solicitudes de part-urls y descuenta del cupo de 120", async () => {
    const app = buildPartUrlsApp();
    const userId = uniqueKey("part-user");

    const res = await request(app).post("/part-urls").set("x-test-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-remaining"]).toBe("119");
  });
});

describe("downloadRateLimiter", () => {
  function buildDownloadApp() {
    const app = express();
    app.use((req, _res, next) => {
      const headerUser = req.headers["x-test-user-id"];
      if (typeof headerUser === "string") {
        (req as any).user = { internalUserId: headerUser };
      }
      next();
    });
    app.use(downloadRateLimiter);
    app.get("/content", (_req, res) => res.status(200).send("bytes"));
    return app;
  }

  it("permite descargas legítimas y descuenta del cupo de 300", async () => {
    const app = buildDownloadApp();
    const userId = uniqueKey("dl-user");

    const res = await request(app).get("/content").set("x-test-user-id", userId);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-remaining"]).toBe("299");
  });

  it("dos usuarios distintos tienen cupos de descarga independientes", async () => {
    const app = buildDownloadApp();
    const userA = uniqueKey("dl-user-a");
    const userB = uniqueKey("dl-user-b");

    const resA = await request(app).get("/content").set("x-test-user-id", userA);
    const resB = await request(app).get("/content").set("x-test-user-id", userB);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.headers["ratelimit-remaining"]).toBe("299");
    expect(resB.headers["ratelimit-remaining"]).toBe("299");
  });
});

