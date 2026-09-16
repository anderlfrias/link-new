# Plan de Logging y Auditoría — chat-interno

Este documento es el punto de entrada para dotar a este monorepo de **logging estructurado**
y para **cerrar los huecos del audit trail** que ya existe a medias.

Está pensado para ser ejecutado por **cualquier agente de IA**, en **múltiples sesiones
separadas**, sin coordinación previa entre ellas. Si estás leyendo esto porque te pidieron
"implementar logs", leé las secciones 1 a 5 completas y después andá al checklist de la fase
que corresponda en `logging-plan/`.

No hace falta pedir permiso para ejecutar las fases: el plan mismo ya fue aprobado. Lo que sí
requiere criterio es no dejar nada a medias (ver protocolo abajo), respetar las reglas de
privacidad de la sección 4 (son no negociables) y **entregar tests con cada cambio** — la regla
de [AGENTS.md](AGENTS.md) aplica a este plan sin excepciones.

---

## 1. Cómo retomar este plan (protocolo de reanudación)

1. **Leé este archivo completo primero**, en especial la sección 4 (privacidad) y la 5 (tabla de fases).
2. **Elegí una sola fase** de `logging-plan/`. Cada fase está diseñada para completarse en una
   sesión. No arranques una fase nueva si la anterior quedó con checkboxes sin marcar.
3. Las fases están **ordenadas por dependencia**, no por gusto: la Fase 0 crea el logger que
   todas las demás usan, y la Fase 3 (auditoría) asume el `requestId` de la Fase 1. No las
   salteés ni las reordenes.
4. Dentro de una fase, andá ítem por ítem:
   - Escribí el código.
   - Escribí el/los test(s) que exige el ítem y corré `npm run test --workspace=backend`.
   - Marcá el checkbox `[x]` en el archivo de la fase.
   - Commit chico, uno por ítem o grupo relacionado. Ej: `feat(backend): logger estructurado con pino`.
5. **Nunca dejes un ítem a medio escribir sin commitear.** Si se corta la sesión, el corte tiene
   que caer *entre* ítems del checklist, nunca en medio de uno.
6. Cuando una fase queda entera en `[x]` y `npm test` pasa completo, marcala ✅ en la tabla de la
   sección 5 con la fecha.
7. Después de cada fase, corré `/graphify backend/src --update` (regla de sincronización del grafo).

---

## 2. Evaluación del estado actual

### 2.1 Qué tiene hoy la app

| Pieza | Estado | Archivo |
|---|---|---|
| Access log HTTP | `morgan("dev")` — formato de consola humana, **en todos los entornos** | `backend/src/app.ts:24` |
| Log de errores | `console.error(err)` crudo, solo para el caso 500 | `backend/src/middlewares/error.middleware.ts:16` |
| Logs de dominio | 38 `console.log`/`console.error` sueltos, con prefijos a mano (`[files]`, `[upload-cleanup]`) | ver [logging-plan/02-console-migration.md](logging-plan/02-console-migration.md) |
| Audit trail | **`ChatAuditLog` ya existe y está en uso** — 10 acciones de chat, con `userId`/`conversationId`/`messageId`/`metadata` | `backend/prisma/schema.prisma:432` |
| IP real del cliente | `app.set("trust proxy", 1)` ya configurado — `req.ip` es el visitante, no Cloudflare | `backend/src/app.ts:19` |
| Jerarquía de errores | `AppError` con `statusCode` + 6 subclases | `backend/src/utils/errors.ts` |
| Supervisión en prod | PM2, `time: true`, sin rotación configurada | `ecosystem.config.js` |
| Frontend | Prácticamente limpio: **2** `console.error` en total | `use-messages.ts:184`, `clipboard.ts:137` |

Lo importante de esa tabla: **el audit log de dominio no hay que inventarlo, ya está**. La mitad
del trabajo "empresarial" está hecha. Lo que falta es (a) logging estructurado de aplicación, que
no existe, y (b) cerrar los huecos del audit trail existente.

### 2.2 Problemas concretos encontrados

Ordenados por gravedad, no por esfuerzo:

1. **🔴 Fuga de credenciales en los logs.** `backend/src/modules/auth/auth.service.ts:37-38`
   loguea el status **y el body completo** de la respuesta de login de EXTERNAL_AUTH. Ese body contiene el
   JWT del usuario. Hoy, cada login exitoso deja un token válido en texto plano en
   `~/.pm2/logs/link-backend-out.log`. En una app de empresa esto es un incidente, no un TODO.
   **Se arregla en la Fase 2 y es el ítem de mayor prioridad de todo el plan.**
2. **🔴 Las acciones de admin no se auditan.** `PATCH /v1/admin/settings` cambia la configuración
   global de la instalación (quién puede borrar grupos, retención de mensajes, límites de subida)
   y no deja **ningún** rastro de quién la cambió ni de qué a qué. `DELETE /v1/admin/files/:id`
   borra bytes físicos de forma irreversible, sin rastro. Para una auditoría interna, estas dos
   son más importantes que todas las acciones de chat juntas.
3. **🔴 El login no se audita.** No hay registro de quién entró, desde qué IP, ni de los intentos
   fallidos. Es lo primero que pide cualquier revisión de seguridad corporativa, y hoy la única
   evidencia de un ataque de fuerza bruta es que el rate limiter lo frenó — sin dejar constancia.
4. **🟠 El audit log no se puede leer.** No hay endpoint, ni pantalla, ni query documentada. Un
   audit trail que solo se puede consultar entrando a Postgres a mano no cumple su función: el que
   necesita auditar (un admin, RRHH, seguridad) no tiene acceso a la base.
5. **🟠 Sin correlación.** Un 500 en producción es una línea de `console.error(err)` que no se
   puede atar a la request que lo causó, ni al usuario, ni a las líneas de log previas.
6. **🟠 Logs no parseables.** `morgan("dev")` está pensado para mirar una terminal en desarrollo
   (coloreado, sin usuario, sin id). No se puede filtrar, contar ni alertar sobre eso.
7. **🟡 Sin rotación ni retención.** Los logs de PM2 crecen sin techo hasta llenar el disco. Y
   `ChatAuditLog` también crece sin límite, a diferencia de `Message`, que ya tiene
   `messageRetentionDays`.
8. **🟡 `metadata` del audit sin contrato.** Hoy es un `Json?` libre. Los usos actuales son
   correctos (no guardan contenido de mensajes), pero nada lo impide: el próximo agente que
   agregue `metadata: { from: oldContent, to: newContent }` a `EDIT_MESSAGE` va a meter texto de
   conversaciones privadas en una tabla de auditoría, sin querer.
9. **🟡 Gotcha de PM2 ya presente.** `ecosystem.config.js` tiene `time: true`, que prefija un
   timestamp propio a cada línea. En cuanto los logs sean JSON, eso los corrompe
   (`2026-09-16T... {"level":30,...}` ya no es JSON válido y `jq` falla). Hay que apagarlo — está
   contemplado en la Fase 5.

---

## 3. La decisión de arquitectura que define todo el plan

**Logs de aplicación y audit trail son dos sistemas distintos.** Mezclarlos es el error más común
y el más caro de revertir. Este plan los mantiene separados a propósito:

| | **Logs de aplicación** (observabilidad) | **Audit trail** (cumplimiento) |
|---|---|---|
| Pregunta que responde | "¿por qué falló esto?", "¿está sana la app?" | "¿quién hizo qué, cuándo y desde dónde?" |
| Quién los lee | devs / ops | admin de la app, seguridad, RRHH, legal |
| Dónde viven | stdout → archivo rotado por PM2 | Postgres, tabla `chat_audit_logs` |
| Retención | días / semanas | meses / años (default de este plan: para siempre) |
| Volumen | alto, best-effort | bajo, una fila por acción significativa |
| Si se pierde una línea | molesta | es un problema de cumplimiento |
| Contenido | técnico, sin PII ni contenido de mensajes | actor + acción + recurso + IP |
| Estado en el repo | **no existe** → Fases 0 a 2 | **existe a medias** → Fases 3 a 5 |

Consecuencia práctica: **nunca** se audita escribiendo al log de aplicación, y **nunca** se
debuggea leyendo la tabla de auditoría. Si un agente se encuentra tentado de hacer
`logger.info("usuario X borró el archivo Y")` como sustituto de una fila de auditoría, está
haciendo mal el trabajo.

### 3.1 Decisiones técnicas (y por qué)

| Decisión | Elección | Por qué |
|---|---|---|
| Librería de logging | **`pino`** + `pino-http` | El más rápido de Node por diseño (serializa a JSON sin formateo intermedio) — importa porque toda request de un chat pasa por acá. JSON de salida sin configurar nada. `pino-http` reemplaza a `morgan` 1:1 y ya trae generación de request-id. Descartado `winston`: más lento, configuración más verbosa y transportes que este proyecto no necesita. |
| Formato | **JSON siempre en producción**, `pino-pretty` solo en desarrollo | JSON es lo que consume cualquier herramienta después (`jq`, Loki, Datadog, ELK) sin parseo custom. Mantener un solo formato en prod evita que el log sea legible para un humano pero inútil para una máquina. |
| Destino | **stdout**, y que PM2 se encargue de los archivos | Doce-factor: el proceso no debería saber en qué archivo vive su log. Ya hay un supervisor (PM2) cuyo trabajo es exactamente eso. Evita tener dos sistemas de rotación compitiendo. |
| Correlación | `requestId` (UUID por request) propagado con **`AsyncLocalStorage`** de `node:async_hooks` | Es la única forma de que un `logger.error()` dentro de `message.service.ts` sepa a qué request pertenece **sin** pasar el logger como parámetro por toda la cadena controller → service → repository. Esa alternativa (pasarlo a mano) toca ~40 archivos y contamina todas las firmas. |
| Redacción de secretos | `redact` de pino, configurado en un solo lugar | Defensa estructural, no disciplina: aunque un agente futuro loguee `{ req }` completo, el `authorization` sale como `[Redacted]`. **Ojo: `redact` opera sobre campos de objetos, no sobre strings interpoladas** — la fuga de `auth.service.ts:37-38` no la arregla `redact`, hay que borrar esas líneas (Fase 2). |
| Prohibir `console.*` | **Un test que falla si aparece `console.` en `backend/src`** | El repo no tiene ESLint. Meter toda una toolchain de lint solo para una regla es desproporcionado; un test encaja con la cultura que ya tiene el repo (vitest + coverage en CI) y falla en el mismo lugar donde el equipo ya mira. |
| Tabla de auditoría | **Extender `ChatAuditLog` en su lugar**, renombrando el modelo a `AuditLog` pero conservando `@@map("chat_audit_logs")` | Una sola tabla consultable es muy superior a dos para auditar. Conservar el `@@map` significa **cero migración de datos**: la tabla física no se toca, solo cambia el nombre del modelo en el código. El prefijo "chat" del nombre físico queda como deuda cosmética documentada, no como un rename riesgoso con `prisma db push`. |
| Escritura de auditoría | **Nunca tira el request abajo** (fail-soft + `logger.error`), salvo las acciones de admin, que van en la misma transacción que su efecto | Hoy `await logAudit(...)` corre *después* del write primario: si falla, el usuario ve un 500 sobre una acción que **sí** se ejecutó. Peor de los dos mundos. Fail-soft + error logueado deja el incidente visible y alertable. Para las acciones de admin (pocas, críticas, de bajo volumen) sí vale el costo de una transacción: efecto y rastro se commitean juntos o ninguno. |
| Retención del audit | Campo nuevo `auditLogRetentionDays Int?` en `AppSettings`, **`null` = deshabilitado** | Copia exactamente el patrón ya establecido por `messageRetentionDays` y `orphanFileRetentionHours`: una instalación existente nunca empieza a borrar datos sin que un admin lo prenda a mano. Para auditoría, "guardar para siempre" es además el default correcto en cumplimiento. |
| Rotación de archivos | `pm2 install pm2-logrotate` + rutas explícitas en `ecosystem.config.js` | Operación, no código. No requiere tocar la app ni redeployar para ajustar el tamaño o la cantidad de archivos retenidos. |
| APM / tracing (OpenTelemetry, Sentry, Datadog) | **Fuera de alcance, y a propósito** | Para una instalación de una sola instancia bajo PM2 es sobredimensionado. Emitir JSON estructurado a stdout es justamente el prerrequisito de todos ellos: si mañana se quiere cualquiera de los tres, se conecta leyendo el mismo log, sin reescribir nada de este plan. |

---

## 4. Reglas de privacidad (no negociables)

Esto es un chat interno de una empresa: los logs son un vector de filtración tan real como la API.
Las siguientes reglas aplican a **todo** el código que toque este plan, y cualquier fase que las
viole se considera no terminada:

1. **Nunca loguear el contenido de un mensaje.** Ni en logs de aplicación, ni en `metadata` de
   auditoría, ni "solo en `debug`", ni truncado. Loguear `messageId` y que quien investigue vaya a
   la base si tiene derecho a hacerlo.
2. **Nunca loguear credenciales ni tokens**: `password`, `authorization`, `Cookie`, `set-cookie`,
   el body de una respuesta de login, `EXTERNAL_AUTH_JWT_SECRET`, `FILE_URL_SIGNING_SECRET`,
   `S3_SECRET_ACCESS_KEY`, `VAPID_PRIVATE_KEY`.
3. **Nunca loguear un body de request completo.** Un `POST /v1/conversations/:id/messages` *es*
   contenido de mensaje. Si hace falta contexto, loguear campos puntuales y no-sensibles
   (`type`, `fileIds.length`).
4. **En logs de aplicación, identificar al usuario por UUID interno** (`internalUserId`), no por
   email ni nombre. En la tabla de auditoría el email sí va: ahí identificar a la persona es
   precisamente el objetivo.
5. **Nombres de archivo subidos: solo `fileId`, `mimeType` y `size`.** El nombre original puede
   ser sensible (`renuncia_juan.pdf`, `sueldos_2026.xlsx`).
6. **`metadata` de auditoría es de esquema cerrado**, documentado en
   `backend/src/modules/audit/README.md`: un `Json?` sin contrato es la vía por la que termina
   entrando contenido privado sin que nadie lo decida.
7. **No enviar logs del frontend al backend.** Ver sección 6.

---

## 5. Fases

| Fase | Archivo | Qué deja andando | Estado |
|---|---|---|---|
| 0 | [logging-plan/00-logger-infrastructure.md](logging-plan/00-logger-infrastructure.md) | `pino` instalado, `src/config/logger.ts`, redacción central, env vars, `pino-http` en lugar de `morgan` | ⬜ Pendiente |
| 1 | [logging-plan/01-correlation-and-errors.md](logging-plan/01-correlation-and-errors.md) | Contexto de request (`requestId`, `ip`, actor) con `AsyncLocalStorage`, en HTTP + sockets + workers; `errorHandler` con nivel según status | ⬜ Pendiente |
| 2 | [logging-plan/02-console-migration.md](logging-plan/02-console-migration.md) | Los 38 `console.*` migrados + test-guardián que prohíbe reintroducirlos. **Incluye el fix de la fuga del token de login.** | ⬜ Pendiente |
| 3 | [logging-plan/03-audit-unification.md](logging-plan/03-audit-unification.md) | Módulo `audit/` único, IP + user-agent, auditoría de login y de acciones de admin | ⬜ Pendiente |
| 4 | [logging-plan/04-audit-read-api.md](logging-plan/04-audit-read-api.md) | `GET /v1/admin/audit-logs` con filtros y paginación + panel en el frontend | ⬜ Pendiente |
| 5 | [logging-plan/05-retention-and-rotation.md](logging-plan/05-retention-and-rotation.md) | Worker de retención del audit, `pm2-logrotate`, `time: false` en PM2 | ⬜ Pendiente |
| 6 | [logging-plan/06-docs-and-closure.md](logging-plan/06-docs-and-closure.md) | `API.md`, READMEs de módulo, AGENTS.md, grafo actualizado | ⬜ Pendiente |

**Valor entregado si el plan se corta a mitad:** las Fases 0 a 3 ya resuelven los tres problemas
🔴. Las Fases 4 y 5 son las que convierten eso en algo que un auditor no técnico puede usar. La
Fase 6 es cierre. Si hay que priorizar con poco tiempo: **0 → 2 → 3**, y dentro de la Fase 2,
el ítem de `auth.service.ts` primero que todo.

---

## 6. Fuera de alcance (decidido, no olvidado)

- **Logging estructurado en el frontend.** Hay 2 `console.error` en total y ambos son correctos
  (errores de UI que el usuario ya ve reflejados). Montar un logger de cliente sería infraestructura
  sin problema que resolver.
- **Endpoint de ingesta de errores del frontend** (`POST /v1/client-logs` o similar). Es un ingreso
  nuevo que acepta texto arbitrario de un cliente no confiable: necesita rate limiting propio,
  redacción, límite de tamaño y una decisión explícita de privacidad (en un chat, un stack trace de
  React puede arrastrar contenido renderizado en las props). Si se quiere, es un plan aparte que
  referencie a este, no un ítem colgado acá.
- **APM / tracing distribuido / agregador externo.** Ver la última fila de la sección 3.1.
- **Alertas** (PagerDuty, mail ante picos de 5xx). Requiere primero tener el log estructurado de
  la Fase 0 — es el paso natural siguiente, pero necesita una decisión de a quién se le avisa.
- **Firma/inmutabilidad criptográfica del audit trail** (hash chain, WORM). Solo tiene sentido si
  el modelo de amenaza incluye a un admin de base de datos malicioso. Si alguna vez se exige,
  anotar que `chat_audit_logs` ya tiene `createdAt` y nunca se hace `UPDATE` sobre sus filas.

---

## 7. Comandos de verificación

Tests del backend (lo que corre CI):

```bash
npm run test --workspace=backend
```

Ambos workspaces:

```bash
npm test
```

Que el build siga compilando (TypeScript `strict`):

```bash
npm run build --workspace=backend
```
