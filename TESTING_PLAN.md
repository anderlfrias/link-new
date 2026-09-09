# Plan de Testing Unitario — chat-interno

Este documento es el punto de entrada para agregar cobertura de tests unitarios a todo
el código que ya existe en este monorepo (`backend/` + `frontend/`), y para dejar
establecida la regla de que **todo código nuevo se entrega con sus tests**.

Está pensado para ser ejecutado por **cualquier agente de IA**, en **múltiples sesiones
separadas**, sin coordinación previa entre ellas. Si estás leyendo esto porque te
pidieron continuar con testing, andá directo a la sección 1.

No hace falta pedir permiso para ejecutar las fases de este plan: es el plan mismo el
que ya fue aprobado. Lo que sí requiere criterio es no dejar nada a medias (ver
protocolo abajo) y no inventar comportamiento — si un archivo hace algo que no está
documentado acá, leelo antes de mockearlo.

## 1. Cómo retomar este plan (protocolo de reanudación)

1. **Leé este archivo completo primero.** Después andá al checklist de la fase que te
   toque (sección 5).
2. **Elegí una sola fase** de `testing-plan/`. Cada fase está diseñada para completarse
   en una sesión — no arranques una fase nueva si la anterior quedó con checkboxes sin
   marcar.
3. Dentro de una fase, **andá archivo por archivo**:
   - Escribí el test.
   - Corrélo (ver comandos en cada checklist) hasta que pase.
   - Marcá el checkbox `[x]` en el checklist correspondiente (`testing-plan/0X-*.md`).
   - Hacé un commit chico (uno por archivo o por un grupo chico de archivos
     relacionados, ej. `service.ts` + `service.test.ts`). Mensaje sugerido:
     `test(backend): cubrir conversation.service.ts`.
4. **Nunca dejes un test a medio escribir sin commitear.** Si se corta la sesión (por
   límite de uso, contexto, lo que sea), el corte tiene que caer *entre* items del
   checklist, nunca en medio de uno. El próximo agente tiene que poder abrir el
   checklist y ver exactamente qué está hecho (`[x]`) y qué falta (`[ ]`) sin tener que
   adivinar leyendo diffs.
5. Cuando una fase completa queda en verde (todos sus checkboxes `[x]` y
   `npm run test --workspace=<backend|frontend>` pasa entero), marcá esa fase como
   ✅ en la tabla de la sección 5 de este archivo, con la fecha.
6. No hace falta terminar todo el plan para que sea útil — **cada fase cerrada ya
   protege esa parte del código**. Priorizá en el orden en que están numeradas: están
   ordenadas por riesgo/valor, no alfabéticamente.

## 2. Alcance

### Qué es un "test unitario" en este plan

Un test rápido (sin red real, sin base de datos real, sin browser real) que corre con
`vitest` y aísla la unidad bajo prueba mockeando sus dependencias externas:

- Backend: se mockea Prisma (a nivel de repositorio, no service — ver sección 3),
  `fetch` global (para llamadas a EXTERNAL_AUTH/Giphy), `socket.io` (`getIO()`), y librerías de
  I/O externas (`web-push`, `music-metadata`).
- Frontend: se mockea `apiRequest`/`fetch`, el cliente de socket (`lib/socket-client.ts`),
  y cualquier hook de Next.js que el componente use (`next/navigation`, etc).

### Fuera de alcance (no forma parte de este plan, no lo bloquea)

- **Tests E2E** (Playwright/Cypress) contra la app corriendo de punta a punta.
- **Tests de integración** contra una base de datos Postgres real.
- **Tests unitarios de `frontend/src/app/**/page.tsx` y `layout.tsx`.** Son Server
  Components / routing de Next.js App Router — no son buenos candidatos para test con
  jsdom hoy. Si en el futuro se agregan, es un plan aparte (probablemente E2E).

Si en algún momento se decide encarar alguna de estas cosas, que sea un plan nuevo que
referencie este documento — no hace falta resolverlo acá.

## 3. Decisiones técnicas (y por qué)

| Decisión | Elección | Por qué |
|---|---|---|
| Test runner | **Vitest**, en ambos workspaces | TS nativo sin transpile aparte, rápido, watch mode, API compatible con Jest (`describe`/`it`/`expect`/`vi.fn`), un solo mental model para todo el repo. |
| Backend HTTP | `supertest` contra el `app` de Express exportado en `backend/src/app.ts` (no levanta un puerto real) | `app.ts` ya exporta la instancia sin hacer `listen()` — ideal para testear middlewares/rutas sin un server real. |
| Mock de Prisma | **Se mockea el módulo repositorio (`vi.mock('./x.repository')`), no el `PrismaClient`**, para tests de `*.service.ts`. Los `*.repository.ts` en sí se testean poco (ver nota abajo). | Los repositorios son wrappers finos sobre Prisma; mockear `PrismaClient` ahí solo verifica "se llamó al método X con estos argumentos" — bajo valor, alto mantenimiento si cambia el schema. El valor real (reglas de negocio, permisos, edge cases) está en la capa de service. |
| Repositorios (`*.repository.ts`) | Testear **solo si tienen lógica condicional real** (ej. construcción dinámica de un `where` de Prisma como en `user.repository.ts#findAllForAdmin` o `file.repository.ts#aggregateFilesForAdmin`). Wrappers CRUD 1:1 quedan opcionales. | Mismo motivo que arriba: priorizar valor sobre cobertura por cobertura. |
| Frontend component/hook tests | `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event`, entorno `jsdom` | Estándar de facto para React, no acopla el test a detalles de implementación. |
| Mock de red en frontend | `vi.mock` sobre `apiRequest` (o sobre `fetch` global) — MSW queda como mejora opcional, no obligatoria | Mantiene el setup liviano; MSW se puede sumar después sin romper nada si algún módulo lo necesita. |
| Ubicación de los tests | **Colocados junto al archivo fuente**: `foo.ts` → `foo.test.ts` en la misma carpeta | Sigue la arquitectura feature-based que ya tiene el repo (`features/<x>/{api,components,hooks,types}`); más fácil de no perder de sincronía que una carpeta `__tests__` separada. |
| Cobertura numérica | **No se exige un % en las Fases 1–15.** Una fase está "hecha" cuando todo lo listado en su checklist tiene test cubriendo camino feliz + los casos de error/edge documentados en el checklist — no cuando `--coverage` dice X%. La Fase final (`testing-plan/03-ci-and-policy.md`) recién ahí fija un piso de cobertura en CI, medido sobre lo que exista en ese momento, para que no baje. | Exigir % desde el día uno en un proyecto sin tests previos genera relleno (tests que solo suman líneas cubiertas sin verificar nada real). |

## 4. Invariantes de negocio ya identificadas (cobertura obligatoria)

Estas reglas están documentadas en el código actual (comentarios/README internos) y son
las que más plata cuestan si se rompen silenciosamente. Cualquier fase que toque estos
archivos **tiene que** incluir un test que las cubra explícitamente — no alcanza con
"pasa la happy path":

- **`assertMembership()`** (`backend/src/modules/conversations/conversation.service.ts`):
  usuario no-miembro de una conversación activa → `ForbiddenError`; conversación
  inexistente/borrada → `NotFoundError`.
- **`allowGroupDelete` es un interruptor maestro sin excepción, ni para admin de la app**
  (ver `conversation.service.ts` / `settings` module): un admin de la app **no** puede
  saltarse este flag. Si un test de permisos de borrado de grupo no incluye el caso
  "admin de la app, flag apagado → igual rechazado", está incompleto.
- **`computeReceipts()` / `aggregateReceiptStatus()`** (`conversation.service.ts`):
  "leído" implica "entregado" (se chequea primero); el estado agregado solo es `"read"`
  si **todos** los destinatarios leyeron, solo `"delivered"` si todos al menos
  recibieron, si no `"sent"`.
- **`buildLastMessagePreview()`** (`conversation.service.ts`): un mensaje borrado
  siempre muestra `"Mensaje eliminado"`, **sin importar el `content` original** (aunque
  tenga texto). Mensaje sin texto pero con archivos adjuntos → `"📎 Archivo adjunto"`.
- **`assertWithinTimeLimit()`** (privada en `backend/src/modules/messages/message.service.ts`,
  usada por `editMessage()` y `deleteMessage()`): fuera de la ventana de edición/borrado
  configurada → rechazo. Es privada — no se importa directo, se cubre a través de
  `editMessage()`/`deleteMessage()`.
- **Login EXTERNAL_AUTH devuelve 403 tanto para credenciales incorrectas como para falta de
  acceso a la app** (`backend/src/modules/auth/auth.service.ts#login`): el mensaje al
  usuario tiene que ser genérico a propósito — un test que espere un mensaje
  "distingue el motivo" está probando lo contrario de lo que el código hace a propósito.
- **`importGiphyAsset()`** (`backend/src/modules/giphy/giphy.service.ts`): el
  `originalUrl` se revalida contra el host real de Giphy (`https` + `*.giphy.com`)
  antes de descargar. Un host que no matchea tiene que ser rechazado — este es
  justamente el tipo de bug de seguridad (SSRF-ish) que un test unitario debe evitar
  que vuelva a pasar desapercibido.
- **Validación de tipo de archivo cliente/servidor debe ser espejada**: el patrón de
  validación en `frontend/src/features/admin/constants/file-type-extension-aliases.constant.ts`
  (y `FileTypeMultiSelect`) tiene que seguir la misma lista de patrones MIME que el
  regex del backend (`backend/src/constants/allowed-file-types.constant.ts`). No hace
  falta un test cruzado automático, pero si se testea un lado hay que anotar en el test
  del otro lado que deben mantenerse en sync (ver Fase 5 backend y Fase 14 frontend).
- **`config/env.ts` corta el proceso (`process.exit(1)`) si falta una variable de
  entorno requerida.** Esto no se "testea" como tal, pero es la razón por la que la
  Fase 0 tiene que fijar variables de entorno dummy en `vitest.config.ts` **antes** de
  que se importe cualquier módulo del backend — si no, cualquier test backend mata el
  proceso entero de test, no solo falla un `it()`. Ver `testing-plan/00-infrastructure-setup.md`.

## 5. Índice de fases y progreso

| # | Fase | Archivo | Workspace | Estado |
|---|---|---|---|---|
| 0 | Infraestructura de testing | [testing-plan/00-infrastructure-setup.md](testing-plan/00-infrastructure-setup.md) | ambos | [x] 2026-09-09 |
| 1 | Fundamentos (utils, middlewares, config) | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-1) | backend | [x] 2026-09-09 |
| 2 | Auth | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-2) | backend | [x] 2026-09-09 |
| 3 | Conversations | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-3) | backend | [x] 2026-09-09 |
| 4 | Messages | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-4) | backend | [x] 2026-09-09 |
| 5 | Files & Storage | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-5) | backend | [x] 2026-09-09 |
| 6 | Settings & permisos de grupo | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-6) | backend | [x] 2026-09-09 |
| 7 | Users, Push, Giphy | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-7) | backend | [x] 2026-09-09 |
| 8 | Socket gateway & Presence | [testing-plan/01-backend-checklist.md](testing-plan/01-backend-checklist.md#fase-8) | backend | [x] 2026-09-09 |
| 9 | Utils & lib (funciones puras) | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-9) | frontend | [x] 2026-09-09 |
| 10 | Providers & UI compartida | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-10) | frontend | [x] 2026-09-09 |
| 11 | Feature: Auth & Admin | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-11) | frontend | [x] 2026-09-09 |
| 12 | Feature: Conversations | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-12) | frontend | [ ] Pendiente |
| 13 | Feature: Messages | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-13) | frontend | [ ] Pendiente |
| 14 | Feature: Files, Giphy, Notifications, Profile, Users, Settings | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-14) | frontend | [ ] Pendiente |
| 15 | Auditoría de cobertura + flujos clave | [testing-plan/02-frontend-checklist.md](testing-plan/02-frontend-checklist.md#fase-15) | frontend | [ ] Pendiente |
| 16 | CI, piso de cobertura y cierre de política | [testing-plan/03-ci-and-policy.md](testing-plan/03-ci-and-policy.md) | ambos | [ ] Pendiente |

Actualizá esta tabla (marcá `[x]` + fecha) cada vez que una fase completa cierre. Ejemplo:
`| 1 | ... | ... | [x] 2026-09-15 |`.

## 6. Política desde ahora en adelante

**Regla vigente desde 2026-09-09, sin excepciones:** ningún cambio que agregue o
modifique comportamiento en `backend/src/**` o `frontend/src/**` se considera terminado
sin al menos un test unitario que cubra su caso principal y sus casos de error/edge
razonables. Esto aplica tanto a features nuevas como a fixes de bugs (un fix sin
test de regresión no evita que el mismo bug vuelva).

Esta regla está duplicada en la raíz del repo en [AGENTS.md](AGENTS.md) (y
`CLAUDE.md`, que apunta a `AGENTS.md`) precisamente para que **cualquier agente la
tenga como contexto cargado automáticamente**, sin depender de que alguien lo derive a
este documento primero.

Excepciones válidas (las únicas): cambios puramente de configuración/infraestructura
sin lógica (ej. bump de una versión, ajuste de un `.env.example`), y cambios de estilo
puro (formateo, reordenar imports) que no tocan comportamiento.

## 7. Convenciones para escribir los tests

- **Un `it()` por comportamiento**, no por función. Nombrá el test por lo que verifica
  ("rechaza cuando el usuario no es miembro"), no por el nombre técnico del método.
- **Arrange-Act-Assert**: separá setup, ejecución y assertion, aunque sea con un salto
  de línea — hace los tests más fáciles de leer en diff.
- **No testear detalles de implementación privados.** Si una función no está exportada
  (ver el caso de `assertWithinTimeLimit` en la sección 4), se cubre a través de la
  función pública que la usa.
- **No testear el framework.** No hace falta un test que verifique que Express llama al
  middleware que le pasaste, o que Prisma genera el cliente — eso ya lo garantiza la
  librería.
- Los comentarios del código ya existente están en español; los identificadores están
  en inglés. Para los tests: nombres de `describe`/`it` en español o inglés son válidos,
  pero **sé consistente dentro de un mismo archivo de test** — no mezcles ambos.
