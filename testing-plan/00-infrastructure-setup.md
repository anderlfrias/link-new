# Fase 0 — Infraestructura de testing

> Prerequisito de todas las demás fases. No se puede escribir un solo test de las Fases
> 1–15 sin esto. Ver [TESTING_PLAN.md](../TESTING_PLAN.md) para el protocolo general.

## Objetivo

Dejar `vitest` funcionando en `backend/` y `frontend/`, con un test trivial pasando en
cada uno, para que las fases siguientes solo tengan que escribir tests — no pelear con
config.

## ⚠️ Antes de empezar: por qué esto no es trivial

Ambos workspaces tienen un módulo `env.ts` que **falla al importarse** si faltan
variables de entorno:

- `backend/src/config/env.ts` valida con `yup` y hace **`process.exit(1)`** si falta
  algo. Como `app.ts` hace `import "./config/env"` en su primera línea, y casi todo
  módulo del backend importa `env` en algún punto de su cadena de imports, **cualquier
  test que importe código del backend sin las env vars seteadas mata el proceso de test
  entero**, no un solo `it()`.
- `frontend/src/lib/env.ts` hace `throw new Error(...)` si falta
  `NEXT_PUBLIC_API_URL` o `NEXT_PUBLIC_SOCKET_URL`. Mismo problema, menos catastrófico
  (throw en vez de exit), pero igual rompe cualquier test que toque `lib/api-client.ts`
  u otro módulo que dependa de `lib/env.ts`.

La solución en ambos casos: setear esas variables en `vitest.config.ts` (vía la opción
`test.env`), que Vitest inyecta en `process.env` **antes** de cargar los archivos de
test. Está resuelto en los config de abajo — no lo saltees si copiás esto a mano.

## Paso 1 — Backend

### 1.1 Instalar dependencias

```bash
npm install -D vitest @vitest/coverage-v8 supertest @types/supertest --workspace=backend
```

No instalar `vitest-mock-extended` todavía (ver nota). Si en la Fase 5/6 hace falta
mockear `PrismaClient` directamente para un repositorio con lógica real, evaluar ahí
si `vitest-mock-extended` es compatible con Prisma 7 + `@prisma/adapter-pg` (no
verificado al escribir este plan — Prisma 7 es muy reciente). Si no compila o el mock
no tipa bien, usar un mock manual acotado a los métodos de Prisma realmente usados:

```ts
vi.mock("../../config/prisma", () => ({
  prisma: { user: { findMany: vi.fn(), count: vi.fn() } },
}));
```

### 1.2 Crear `backend/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Ver sección "⚠️ Antes de empezar": estas dummy values evitan que
    // config/env.ts llame a process.exit(1) al importarse durante los tests.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      PORT: "4000",
      EXTERNAL_AUTH_API_URL: "https://external-auth.test.local",
      APP_CODE_EXTERNAL_AUTH: "test-app-code",
      EXTERNAL_AUTH_JWT_SECRET: "test-jwt-secret",
      MAX_UPLOAD_SIZE_MB: "25",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/**/*.test.ts", "src/server.ts"],
    },
  },
});
```

Si la versión de Vitest instalada no soporta `test.env` (chequear en el `CHANGELOG` del
paquete instalado si `npm install` trae una major muy distinta a la esperada al
escribir este plan), la alternativa es crear `backend/.env.test` con los mismos valores
dummy de arriba y cargarlo a mano al tope de `vitest.config.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.test" });
```

### 1.3 Scripts en `backend/package.json`

Agregar dentro de `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### 1.4 Helper de fixtures (opcional pero recomendado)

Crear `backend/src/test/fixtures.ts` con factories chicas para no repetir objetos User/
Conversation/Message de mentira en cada test. Ejemplo de arranque (ampliar según haga
falta en cada fase, no intentar cubrir todos los modelos de una — agregar la factory
cuando la primera fase que la necesita la necesita):

```ts
import { ConversationType } from "@prisma/client";

export function buildUser(overrides: Partial<{ id: string; roles: string[] }> = {}) {
  return { id: "user-1", roles: [], ...overrides };
}
```

## Paso 2 — Frontend

### 2.1 Instalar dependencias

```bash
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react --workspace=frontend
```

### 2.2 Crear `frontend/vitest.config.ts`

```ts
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Ver 00-infrastructure-setup.md: lib/env.ts hace throw si faltan estas.
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
      NEXT_PUBLIC_SOCKET_URL: "http://localhost:4000",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.types.ts",
        "src/**/*.test.{ts,tsx}",
        "src/app/**", // fuera de alcance, ver TESTING_PLAN.md sección 2
      ],
    },
  },
});
```

### 2.3 Crear `frontend/src/test/setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
```

Si al escribir tests de componentes concretos aparecen errores de `matchMedia`,
`IntersectionObserver` o `ResizeObserver` no definidos (jsdom no los implementa), es acá
donde se agrega el polyfill/mock — no antes, para no mockear cosas que ningún test usa
todavía. Ejemplo si hace falta:

```ts
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
  }) as unknown as MediaQueryList;
}
```

Si algún componente usa hooks de `next/navigation` (`useRouter`, `usePathname`, etc.),
mockearlos por archivo de test con `vi.mock("next/navigation", () => ({ ... }))`, no
acá globalmente — cada componente necesita un mock distinto según qué use.

### 2.4 Scripts en `frontend/package.json`

Agregar dentro de `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

## Paso 3 — Wiring en la raíz

### 3.1 Script en el `package.json` de la raíz

Agregar dentro de `"scripts"`:

```json
"test": "npm run test --workspace=backend && npm run test --workspace=frontend"
```

### 3.2 `.gitignore`

Agregar (no existe todavía):

```
# Test coverage output
backend/coverage/
frontend/coverage/
```

## Paso 4 — Prueba de humo (obligatoria antes de dar la Fase 0 por cerrada)

Escribir y hacer pasar UN test trivial en cada workspace, para probar que el pipeline
completo funciona antes de invertir tiempo en las fases de contenido real:

- `backend/src/utils/errors.test.ts` — instanciar cada clase de
  `backend/src/utils/errors.ts` y verificar `statusCode`/`name`/`message`.
- `frontend/src/utils/cn.test.ts` — un par de casos de
  `frontend/src/utils/cn.ts` (merge de clases, condicionales falsy ignoradas).

Correr:

```bash
npm run test --workspace=backend
npm run test --workspace=frontend
```

Ambos tienen que terminar en verde. Si no, la Fase 0 no está terminada — no pasar a la
Fase 1 con el pipeline roto, todo lo que se escriba después hereda el problema.

## Definition of Done — Fase 0

- [ ] `backend/vitest.config.ts` creado, `npm run test --workspace=backend` corre sin
      que `config/env.ts` tire el proceso.
- [ ] `frontend/vitest.config.ts` + `src/test/setup.ts` creados, `npm run test --workspace=frontend` corre.
- [ ] Scripts `test`/`test:watch`/`test:coverage` en ambos `package.json` + script `test`
      en el `package.json` de la raíz.
- [ ] `.gitignore` actualizado con las carpetas `coverage/`.
- [ ] `backend/src/utils/errors.test.ts` y `frontend/src/utils/cn.test.ts` existen y
      pasan.
- [ ] Marcada la Fase 0 como hecha en la tabla de `TESTING_PLAN.md` (sección 5).
- [ ] Commit hecho (sugerido: `test: setup de vitest en backend y frontend`).
