# Fase 2 — Migrar los 38 `console.*` (incluye el fix de la fuga de tokens)

**Prerrequisitos:** Fases 0 y 1 cerradas (`logger`, `getLogger()`, contexto de workers).
**Deja andando:** cero `console.*` en `backend/src` (salvo la única excepción justificada), y un
test que falla si vuelve a aparecer uno.

> **El ítem §2.2 es el de mayor prioridad de todo el plan.** Si solo tenés tiempo para una cosa
> en esta sesión, que sea ése. Hoy hay JWT de usuarios en texto plano en los logs de producción.

---

## 2.1 Convenciones de logging (leer antes de tocar un archivo)

### Qué va en el mensaje y qué va en el objeto

La ganancia de pasar de `console.log` a un logger estructurado **no** es el nivel: es que los datos
variables van en un objeto, no interpolados en el texto. Así el log se puede filtrar y contar.

```ts
// ❌ Mal: no se puede buscar "todos los fallos de este archivo", el texto es único por línea
logger.error(`[files] adminDeleteFile: failed to delete physical file for ${fileId}`);

// ✅ Bien: el mensaje es constante y agrupa; los datos son campos consultables
logger.error({ fileId, err }, "failed to delete physical file");
```

Reglas:
- **Mensaje constante**, en minúsculas, sin datos interpolados. Es la clave de agrupación.
- **Datos como primer argumento**, siempre un objeto. El error va en la clave `err` — pino tiene un
  serializer propio para eso y extrae `type`/`message`/`stack` solo.
- **Borrar los prefijos a mano** (`[files]`, `[upload-cleanup]`, `[file-migration]`). El contexto
  de la Fase 1 ya agrega el campo `worker`, y el módulo se deduce del `requestId`. Un prefijo
  dentro del mensaje rompe la agrupación que acabamos de ganar.
- **Usar `getLogger()`** (de `config/request-context`), no el `logger` raíz importado directo, en
  cualquier código que corra dentro de una request o de un tick de worker. Solo el arranque del
  proceso (`server.ts`) usa `logger` directo — ahí todavía no hay contexto.

### Tabla de niveles

| Nivel | Cuándo | Ejemplo en este repo |
|---|---|---|
| `fatal` | El proceso no puede seguir y va a morir | configuración de entorno inválida |
| `error` | Algo falló inesperadamente y alguien tiene que mirarlo | EXTERNAL_AUTH devolvió un shape desconocido; no se pudo borrar el archivo físico |
| `warn` | Esperado pero digno de registro; la app degradó y siguió | Giphy sin API key; foto de perfil de EXTERNAL_AUTH no disponible; un 4xx |
| `info` | Cambio de estado que vale registrar en producción | server escuchando; barrido de retención borró N mensajes; archivo migrado a S3 |
| `debug` | Solo útil investigando; apagado en producción | status de la respuesta de EXTERNAL_AUTH; foto de perfil cacheada |
| `trace` | No se usa en este repo | — |

Criterio para dudas entre `info` y `debug`: **si en producción se emite una línea por cada acción
de un usuario, es `debug`.** `info` es para cosas que pasan de a decenas por día, no por minuto.

- [ ] Convenciones leídas (no hay checkbox que valga: el revisor las va a mirar en el diff)

---

## 2.2 🔴 `auth.service.ts` — la fuga de tokens (14 llamadas)

### El problema

`backend/src/modules/auth/auth.service.ts:37-38`:

```ts
    console.log(`EXTERNAL_AUTH login request returned status ${response.status}`);
    console.log(`EXTERNAL_AUTH login request body: ${await response.clone().text()}`);
```

La segunda línea loguea el body completo de la respuesta de login de EXTERNAL_AUTH, **que contiene el JWT
del usuario**. Cada login exitoso deja una credencial válida en texto plano en
`~/.pm2/logs/link-backend-out.log`, un archivo sin rotación (Fase 5) que cualquiera con acceso al
server puede leer, y que se copia en cualquier backup del server.

Notá que el `redact` de pino **no** protege de esto: redacta propiedades de objetos, y acá el token
ya está dentro de una string interpolada. La única solución es no construir esa string.

### El fix

Borrar las dos líneas y dejar únicamente el status, en `debug`:

```ts
    getLogger().debug({ status: response.status }, "external-auth login responded");
```

**Nunca** el body, ni truncado, ni "solo los primeros 50 caracteres" (el token puede empezar en
cualquier offset), ni detrás de un `if (env.LOG_LEVEL === "debug")`. El body de una respuesta de
autenticación no se loguea.

- [ ] Líneas 37-38 reemplazadas por la de `debug` con solo el status
- [ ] `grep -n "response.clone\|\.text()" backend/src/modules/auth/auth.service.ts` revisado: no
      quedó ninguna otra vía por la que el body llegue a un log

### Test de regresión obligatorio (no opcional)

En `auth.service.test.ts`, con `fetch` mockeado (ver `src/test/http-mocks.ts`) devolviendo un body
que contenga un valor centinela reconocible:

- [ ] Login exitoso con body `{ token: "SENTINEL_TOKEN_VALUE", ... }` → **ninguna** llamada al
      logger contiene `SENTINEL_TOKEN_VALUE`, ni en el mensaje ni en el objeto de datos
      (serializá todos los argumentos de todas las llamadas espiadas a JSON y buscá el centinela)
- [ ] Login fallido (403) → tampoco aparece el body en ningún log
- [ ] El comportamiento visible de `login()` no cambió: sigue devolviendo el token y sigue
      tirando `ForbiddenError` / `ServiceUnavailableError` en los mismos casos

### Las otras 12 llamadas del archivo

| Líneas | Qué es | Nivel |
|---|---|---|
| 108, 121, 132 | Falla al traer la foto de perfil de EXTERNAL_AUTH (request falló / status raro / no es data URI) | `warn` — la app sigue funcionando sin foto |
| 201 | Foto de perfil cacheada OK | `debug` — una por login |
| 203 | Falla al cachear la foto | `error` |
| 312, 320, 328, 334 | Sincronización de usuarios de EXTERNAL_AUTH: request falló / status raro / JSON inválido / shape inesperado | `error` |
| 361 | Entrada de usuario malformada, se saltea | `warn` — degradación parcial esperable |
| 389, 404 | Fallas al persistir usuarios sincronizados | `error` |

- [ ] Las 12 migradas con su nivel, mensaje constante y datos en el objeto
- [ ] Ningún log de este archivo incluye `password`, el body de una respuesta de auth, ni el email
      del usuario (usar `userId`, LOGGING_PLAN.md §4.4)
- [ ] Test por cada rama de error ya existente en `auth.service.test.ts` extendido para assertear
      el nivel logueado (al menos en las 4 de sincronización de usuarios)

---

## 2.3 Resto de los módulos (4 llamadas)

| Archivo | Líneas | Nivel sugerido | Nota |
|---|---|---|---|
| `modules/files/file.service.ts` | 353 | `error` | `{ fileId, err }`, sin el prefijo `[files]`. El comentario de arriba explica por qué el catch existe — dejalo. |
| `modules/giphy/giphy.service.ts` | 49, 185 | `warn` | Giphy caído es degradación de una feature opcional, no un error del sistema |
| `modules/giphy/giphy.service.ts` | 69 | `warn` | incluir `{ path, status }` como campos, no interpolados |

- [ ] `file.service.ts:353` migrada
- [ ] Las 3 de `giphy.service.ts` migradas
- [ ] Tests de `file.service.test.ts` y `giphy.service.test.ts` extendidos: la rama de error
      loguea en el nivel esperado con el `err` presente

---

## 2.4 Workers (17 llamadas)

Los tres ya corren dentro de `runWorkerTick` (Fase 1 §1.5), así que **el campo `worker` lo pone el
contexto**: hay que borrar los prefijos `[message-retention]`, `[upload-cleanup]` y
`[file-migration]` de los mensajes.

| Archivo | Líneas | Nivel |
|---|---|---|
| `workers/message-retention.worker.ts` | 18 | `info` — `{ deletedCount, cutoffDate }`, una por hora como máximo |
| `workers/upload-cleanup.worker.ts` | 39, 66, 88, 106, 130, 149 | `info` — acciones efectivamente realizadas |
| `workers/upload-cleanup.worker.ts` | 52, 96, 140 | `error` — fallos de borrado físico |
| `workers/file-migration.worker.ts` | 82, 88 | `info` — migración y borrado local exitosos |
| `workers/file-migration.worker.ts` | 42, 66, 90, 94, 121 | `error` — fallos de migración y el catch del tick |

Dos detalles específicos:
- `upload-cleanup.worker.ts:88` es la rama de **dry-run** (`[dry-run] Would delete...`). Mantenerla
  distinguible, pero como campo: `logger.info({ fileId, dryRun: true }, "orphan file would be deleted")`.
  Así se pueden contar las acciones simuladas sin parsear el texto.
- `file-migration.worker.ts:121` es el catch del tick entero. Va `error` con `{ err }` y mensaje
  `"migration tick failed"` — es la línea que dice que el worker se rompió, no un archivo puntual.

- [ ] Las 17 migradas, con los prefijos `[...]` eliminados
- [ ] Tests de los 3 workers extendidos: al menos el camino de éxito y una rama de error de cada
      uno assertean el nivel y los campos

---

## 2.5 Los dos casos especiales

### `server.ts:32` — arranque del proceso

Todavía no hay contexto de request, así que usa el logger raíz directo:

```ts
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, "server listening");
});
```

- [ ] Migrada, importando `logger` de `./config/logger` (no `getLogger`)

### `config/env.ts:52` — la única excepción permitida

```ts
  console.error("Invalid environment configuration:\n" + ...);
  process.exit(1);
```

**Se queda como está.** `logger.ts` importa `env.ts` para leer `LOG_LEVEL`: si `env.ts` importara
el logger habría un ciclo, y además en ese punto la configuración es inválida — no hay garantía de
que el logger pueda construirse. Un `console.error` seguido de `process.exit(1)` es lo correcto acá.

Lo único que hay que hacer es **documentar la excepción en el propio archivo**, para que el próximo
agente no la "arregle":

```ts
  // Única excepción a la prohibición de console.* en este backend (ver
  // LOGGING_PLAN.md y src/no-console.test.ts): logger.ts importa este archivo
  // para leer LOG_LEVEL, así que acá todavía no existe un logger que usar — y
  // si la configuración es inválida, tampoco hay garantía de poder construirlo.
  console.error("Invalid environment configuration:\n" + ...);
```

- [ ] Comentario de excepción agregado en `env.ts`
- [ ] `console.error` **no** migrado (a propósito)

---

## 2.6 El test-guardián — `backend/src/no-console.test.ts` (archivo nuevo)

Este repo no usa ESLint (verificado: no hay configuración de lint en ningún workspace). Meter toda
una toolchain para una sola regla es desproporcionado; un test falla en el mismo lugar donde el
equipo ya mira (CI corre `test:coverage` en cada PR).

El test recorre `backend/src/**/*.ts`, saltea los `*.test.ts` y la excepción declarada, y falla
listando archivo y línea de cualquier `console.` que encuentre.

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/// Archivos con una excepción justificada y documentada en el propio archivo.
/// Agregar algo acá requiere el mismo comentario de por qué (ver env.ts).
const ALLOWED = new Set(["config/env.ts"]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("prohibición de console.* en el backend", () => {
  it("no hay ningún console.* fuera de las excepciones declaradas", () => {
    const srcRoot = join(__dirname);
    const offenders: string[] = [];

    for (const file of collectSourceFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\bconsole\s*\./.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
    }

    // El mensaje de fallo tiene que decir qué hacer, no solo que falló: este
    // test lo va a ver alguien que no leyó LOGGING_PLAN.md.
    expect(offenders, `Usá el logger de src/config/logger.ts (ver LOGGING_PLAN.md §3) en vez de console.*:\n${offenders.join("\n")}`).toEqual([]);
  });
});
```

- [ ] Test creado y **pasando** (si falla, quedan `console.*` sin migrar — terminá §2.2 a §2.5 antes)
- [ ] El mensaje de fallo nombra el archivo y la línea
- [ ] `ALLOWED` contiene únicamente `config/env.ts`

---

## 2.7 Verificación de la fase

```bash
npm run test --workspace=backend
```

```bash
grep -rn "console\." backend/src --include="*.ts" | grep -v "\.test\.ts"
```

Ese `grep` tiene que devolver **exactamente una** línea: la de `config/env.ts`.

- [ ] 37 de 38 `console.*` migradas; la de `env.ts` documentada como excepción
- [ ] `no-console.test.ts` en verde
- [ ] El test de regresión del token de login en verde
- [ ] `npm run build --workspace=backend` compila
- [ ] Levantando el server y haciendo un login real, **el log no contiene el token** (verificalo de
      verdad, es el punto de toda la fase):

```bash
npm run dev --workspace=backend 2>&1 | grep -i "eyJ" || echo "OK: sin JWT en el log"
```

Commits sugeridos (uno por bloque, el de auth primero):
`fix(backend): dejar de loguear el body de la respuesta de login de EXTERNAL_AUTH`
`refactor(backend): migrar console.* a logger estructurado`
`test(backend): guardian que prohibe console.* en el backend`

Al cerrar: marcar la Fase 2 ✅ en [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 y correr
`/graphify backend/src --update`.
