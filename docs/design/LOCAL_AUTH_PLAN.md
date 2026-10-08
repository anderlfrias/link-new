# Plan de Autenticación: cuentas locales y proveedor externo opcional — LINK

> **Documento histórico.** Describe cómo nació el modo local, cuando el login contra un sistema externo era lo
> único que había. Lo que toca al proveedor externo cambió después: se instala como plugin
> (`AUTH_PROVIDER_MODULE`, ver [docs/auth-providers.md](../auth-providers.md)) y LINK emite siempre su propia
> sesión, con cualquier proveedor. Donde este documento dice lo contrario (por ejemplo, que con un proveedor
> externo el token del proveedor es la sesión, D5 a D7), manda lo de `docs/auth-providers.md`. Las decisiones del
> modo local y las invariantes de seguridad (§8) siguen vigentes.

> El proveedor externo pasa a ser **opcional**. Si el `.env` tiene su configuración, la app autentica con
> él; si no la tiene, usa **cuentas locales**, con credenciales administradas en esta
> misma plataforma. Cada instalación usa **uno u otro**, nunca los dos a la vez.

**Estado:** implementado. Las 12 fases se cerraron entre el 2026-10-05 y el 2026-10-06 (ver
[sección 9](#9-fases)); las decisiones están en la [sección 11](#11-decisiones-confirmadas). El modo
híbrido (un proveedor externo y cuentas locales a la vez) se evaluó y se descartó. Este documento queda como
referencia del diseño y de las invariantes de seguridad (§8) que cualquier cambio futuro tiene que
mantener cubiertas.

Este documento sigue el formato de [TESTING_PLAN.md](TESTING_PLAN.md) y [LOGGING_PLAN.md](LOGGING_PLAN.md):
está pensado para que lo ejecute cualquier agente de IA (o persona) en varias sesiones separadas,
una fase por sesión, sin coordinación previa.

---

## 1. Cómo retomar este plan

1. Leé este archivo completo. Después [AGENTS.md](../../AGENTS.md) (tests obligatorios, nada de `console.*`)
   y [LOGGING_PLAN.md](LOGGING_PLAN.md) §3 y §4 (logs vs. auditoría, reglas de privacidad): este plan
   toca contraseñas y tokens, así que §4 aplica en **todas** las fases.
2. Elegí la **primera fase sin ✅** de la [sección 9](#9-fases). No arranques una fase si la anterior
   quedó con checkboxes sin marcar.
3. Dentro de la fase: un ítem → su test → `[x]` → commit chico (ej. `feat(auth): hash de contraseñas
   locales`). Si se corta la sesión, el corte tiene que caer *entre* ítems, nunca en medio de uno.
4. Una fase está cerrada cuando `npm run test --workspace=<backend|frontend>` pasa entero y
   `npx tsc --noEmit` está limpio en el workspace tocado. Marcala con ✅ y la fecha en la tabla de la
   sección 9.
5. Cada fase actualiza los README/`API.md` que toca: la cultura del repo es documentar el *por qué*
   junto al cambio, no al final. Si usás graphify (existe `graphify-out/`), actualizá el grafo al
   cerrar cada fase.

---

## 2. Qué se quiere lograr (y qué no cambia)

| Modo | Cuándo se activa | Quién inicia sesión |
|---|---|---|
| `externo` | El `.env` tiene la configuración del proveedor externo (es el `.env` de hoy). | Cuentas del proveedor externo, exactamente como hoy. |
| `local` | El `.env` no tiene la configuración del proveedor externo. | Cuentas locales, con credenciales guardadas y administradas en esta plataforma. |

Además:

- En modo `local`, cada cuenta entra con su **correo** o, si lo tiene, con su **nombre de usuario**
  (opcional). Las crea y las administra un admin desde el panel.
- La **duración de sesión** y la **política de contraseñas** del modo local (largo mínimo,
  complejidad, vencimiento, historial y bloqueo por intentos fallidos) se configuran desde
  *Configuración global*, no desde el `.env`.
- Un admin puede **desactivar cualquier cuenta** dentro del chat, en los dos modos. En modo `externo`,
  una cuenta desactivada no entra aunque el proveedor externo acepte su contraseña.
- Una instalación puede **cambiar de modo sin perder el historial** de sus usuarios (§10).

Lo que **no** cambia:

- **En modo `externo` el login sigue siendo del proveedor.** (Así nació; hoy LINK además emite su propia sesión y
  guarda los roles que entrega el proveedor, ver el aviso del principio.) Las únicas diferencias visibles son que un admin puede desactivar cuentas
  y que el login dice "Usuario o correo electrónico", porque el proveedor externo ya acepta el correo en ese campo
  (invariante 14, §8).
- **El historial sobrevive a un cambio de modo.** Todo el modelo relaciona por `User.id` interno, nunca
  por `externalId` (`backend/README.md`, "¿Por qué todas las relaciones usan el `id` interno?"). `User`
  es el perfil dentro del chat; el modo solo decide quién autentica a esos perfiles.

Este plan implementa una idea que ya estaba documentada en `backend/README.md` ("Proveedor de
Autenticación"): el proveedor es de la instalación, no de cada cuenta. Cambian dos cosas: ahora se
deduce del `.env`, y se puede cambiar siguiendo el procedimiento de §10.

---

## 3. Estado actual: dónde está acoplado el proveedor externo

Mapa de impacto, verificado contra el código al 2026-10-05. Toda fase que toque uno de estos puntos
tiene que dejarlo consistente con el resto.

| # | Punto de acoplamiento | Dónde | Qué pasa hoy |
|---|---|---|---|
| 1 | Variables el proveedor externo obligatorias | `backend/src/config/env.ts:7-9` | Sin las variables del proveedor el server no arranca (`process.exit(1)`). |
| 2 | Verificación de token | `backend/src/modules/auth/jwt.ts:37-39` | Solo conoce el secreto del proveedor. |
| 3 | Middleware HTTP | `backend/src/middlewares/auth.middleware.ts:6-23` | `mapTokenToUser(verifyToken(token))`. |
| 4 | Usuario interno | `backend/src/middlewares/current-user.middleware.ts:18` | Resuelve el `User` **por email** del token, sin mirar `status`. |
| 5 | Socket | `backend/src/socket/socket-auth.middleware.ts:31-38` | Copia de 3 + 4 para el handshake. |
| 6 | Contenido de archivos | `backend/src/modules/files/file.controller.ts:62-72` | **Tercera** verificación independiente (rama Bearer), con la misma búsqueda por email. |
| 7 | Firma de URLs de archivos | `backend/src/modules/files/file.service.ts:66-68` | Fallback a el secreto del proveedor, que en modo local no existe. |
| 8 | Directorio de contactos | `backend/src/modules/users/user.service.ts:11,28` y `user.controller.ts:12,25` | Siempre llama a `syncAppUsers(token)`; en modo local no hay el proveedor externo al que llamar. |
| 9 | Alta/actualización desde el proveedor externo | `backend/src/modules/auth/auth.repository.ts:18-40` | Busca por email: eso es lo que permite migrar de local al proveedor externo conservando el historial. Pero si el username que trae el proveedor externo ya lo tiene otra fila, el alta falla por unique y el login responde 500. |
| 10 | Roles | `constants/roles.constant.ts`, `requireRoles`, y `req.user.roles` en `conversation.controller.ts:9`, `upload.controller.ts`, `file.controller.ts:33,71` | Vienen del JWT del proveedor externo y nunca se persisten (`users/README.md`, "Por qué esta vista no muestra el rol"). |
| 11 | Esquema | `backend/prisma/schema.prisma:17-28` (`AuthProvider`), `:188-252` (`User`) | `AuthProvider` está declarado "para uso futuro" y nadie lo usa. |
| 12 | Auditoría | `backend/src/modules/audit/audit.types.ts:28-37` | `LOGIN_FAILED.reason` solo conoce motivos del proveedor externo. |
| 13 | Frontend | `LoginForm.tsx:47-55`, `auth.types.ts:8-24`, `AdminUsersPanel.tsx:34-39`, `AdminUserRow.tsx:56-58`, `i18n/locales/es.ts:492,504-505` | Placeholder "Usuario", panel de usuarios de solo lectura ("hacelo desde el proveedor externo"), badge "Sincronizado con el proveedor externo". |
| 14 | Tests | `backend/vitest.config.ts:11-25`, y los que mockean `verifyToken`/`mapTokenToUser`: `auth.middleware`, `current-user.middleware`, `socket-auth.middleware`, `settings.controller`, `upload.route`, `file.route`, `audit.route` | Asumen el proveedor externo. |
| 15 | Configuración global | `modules/settings/settings.validator.ts`, `settings.types.ts`, `frontend/.../AdminSettingsPanel.tsx`, `admin-settings.types.ts` | No existe nada de sesión ni de contraseñas. Ojo: cada campo nuevo va en el schema **y** en la lista del test `at-least-one-field` del validator; si falta en la lista, un `PATCH` con solo ese campo se rechaza. |
| 16 | Estado de las cuentas | `users/README.md` ("Sobre `status`"), `user.repository.ts:18` | `UserStatus.INACTIVE` existe pero ningún flujo lo usa. El directorio ya lo filtra. |

---

## 4. Decisiones de arquitectura (y por qué)

### 4.0 Vista general

```
.env con las variables del proveedor  → modo externo: login, token y roles del proveedor externo (como hoy)
.env sin las variables del proveedor  → modo local: login con correo o usuario → scrypt → JWT propio

Authorization: Bearer <jwt>   (HTTP, handshake del socket y /files/:id/content)
  └─ el verificador del modo activo (hay uno solo)
     └─ resolveInternalUser → status ACTIVE (los dos modos)
                              + modo local: tokensValidAfter · antigüedad ≤ duración vigente · roles de la base
```

### 4.1 Configuración

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| D1 | Cómo se elige el modo | Se deduce del `.env`: la configuración del proveedor presentes → `externo`; ninguna → `local`. Configuración parcial (1 o 2 de las 3) → error de arranque. No hay variable `AUTH_MODE`. Al arrancar se loguea el modo activo. | Es exactamente lo pedido ("si el proveedor externo no está definido, cuentas locales"), y una instalación existente queda en `externo` sin tocar su `.env`. Con solo dos modos, una variable extra sería redundante. Que una configuración parcial sea un error atrapa un typo o una variable borrada a medias, en vez de pasar en silencio a modo local. |
| D2 | Validación | `resolveAuthConfig(rawEnv)`, función **pura** en `src/config/`, invocada desde `env.ts` dentro del mismo `try`: sus errores salen por el mismo `console.error` + `process.exit(1)` de hoy. En modo `local` exige `LOCAL_AUTH_JWT_SECRET` (32 caracteres o más); en modo `externo`, si está, se ignora con un `warn`. `env` expone la config ya resuelta. | Se testea con una matriz de casos sin pelear con `process.exit`. Al volver opcionales las las variables del proveedor, TypeScript marca cada uso directo de `env.las variables del proveedor`: es la lista exacta de lo que hay que migrar. En el `.env` quedan solo la configuración del proveedor externo y los secretos; la sesión y las contraseñas son de un admin (§4.4). |

### 4.2 Credenciales, tokens e identidad

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| D3 | Dónde viven las credenciales | Tabla nueva `LocalCredential`, 1:1 con `User`: hash, historial, cambio obligatorio y estado de bloqueo. `User` solo suma `localRoles` y `tokensValidAfter`. | `backend/README.md` ya fija que identidad y credenciales "no viven en este modelo". Es defensa estructural: `attachInternalUser`, el socket y otros cargan la fila entera de `User`, así que con el hash ahí alcanzaría con que algún endpoint la serializara para filtrarlo. Y es lo que hace barata la migración (§10): cambiar de modo no toca `User`. |
| D4 | Hash de contraseñas | `crypto.scrypt` de Node, sin dependencias nuevas, con **N=2^14, r=8, p=5** (la configuración equivalente de OWASP a N=2^17, con 16 MiB en vez de 128 MiB) y siempre en su versión **async**. Formato autodescriptivo `scrypt$N$r$p$salt$hash`, comparación con `timingSafeEqual`, normalización NFKC. Los parámetros de scrypt y el máximo de 128 caracteres son **fijos en código**; el resto de la política la configura un admin (§4.4). | Sin dependencia nativa, así que se comporta igual en el Windows de desarrollo y en el Linux de producción. Con N=2^17 cada hash reserva 128 MiB fuera del heap: 4 logins simultáneos (el pool de libuv) son ~512 MiB y PM2 reinicia el proceso a los 500 MB (`ecosystem.config.js:41`). `scryptSync` bloquearía el event loop, y con él todos los sockets. Guardar los parámetros en el hash permite subirlos (o migrar a argon2id) rehasheando en el próximo login exitoso. Por eso mismo no van al panel: un valor mal elegido tira el proceso por memoria, y sin máximo de largo cualquiera puede mandar un input gigante para ocupar CPU. |
| D5 | Token del modo local | El backend firma su propio JWT: HS256 con `LOCAL_AUTH_JWT_SECRET` y claims `sub` (id interno), `email`, `iss: "link-local"`, `aud: "link"`, `iat`, `exp` (según `localSessionTtlHours`, D15) y `pcr: true` ("password change required") solo si tiene que cambiar la contraseña. En modo `externo` el backend sigue sin emitir tokens propios. | El modo `externo` queda intacto: su token hace falta para `syncAppUsers` y para la foto de perfil. `iss`/`aud` no cuestan nada y evitan que se acepte el token de otra app firmado con el mismo secreto. |
| D6 | Un solo verificador | `verifyAccessToken(token)` usa el verificador del modo activo, con `algorithms: ["HS256"]` (más `issuer` y `audience` en el local). En modo `local` no se acepta ningún token del proveedor externo, y en modo `externo` ninguno local. | Al cambiar de modo, los tokens del modo anterior quedan muertos en el acto, sin lógica extra. |
| D7 | Resolución de identidad unificada | Una sola función, `resolveInternalUser(identity)`, usada por `attachInternalUser`, el socket y `file.controller#getContent`. Modo `externo`: busca por email, como hoy. Modo `local`: busca por `sub` (id). En los dos, `status` tiene que ser `ACTIVE`. Solo en `local`: `iat ≥ tokensValidAfter`, antigüedad del token ≤ duración de sesión vigente (D16), y roles, email y nombre salen de la fila. | Hoy hay tres copias de la misma lógica (puntos 4, 5 y 6 del mapa). Buscar por id en modo local hace que un cambio de email hecho por un admin no rompa ni redirija sesiones. Leer roles y configuración no cuesta nada extra: ese `findUnique` ya se hace hoy y `AppSettings` está en cache de proceso. `authenticate` deja `roles: []` en los tokens locales hasta que `attachInternalUser` los complete: si alguien monta `requireRoles` sin `attachInternalUser`, falla cerrado. |
| D8 | Roles en modo local | `User.localRoles String[]`. En modo `externo` se ignora: los roles siguen saliendo del JWT del proveedor externo. | Es el único modo en que la app asigna roles. Efecto secundario bueno: en modo local, el panel de usuarios puede mostrar quién es admin (en `externo` sigue sin poder, ver `users/README.md`). |
| D9 | Revocación | `User.tokensValidAfter` (modo local): se mueve al cambiar o restablecer la contraseña y al desactivar la cuenta, y se guarda **truncado al segundo**. En esos casos, y al desactivar una cuenta en modo `externo`, se desconectan los sockets del usuario con una función nueva en `socket/rooms.ts` (`io.in(userRoomName(id)).disconnectSockets(true)`). | `iat` está en segundos: sin truncar, un token emitido en el mismo segundo que el corte (como el que devuelve el cambio de contraseña) quedaría rechazado. El socket solo se autentica en el handshake: sin cortarlo, una cuenta desactivada seguiría recibiendo mensajes en vivo. `rooms.ts` es el único punto autorizado a tocar la API de socket.io. |

### 4.3 Login

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| D10 | Endpoint | El mismo `POST /v1/auth/login`, con el mismo body `{ user, password }`. Modo `externo`: igual que hoy. Modo `local`: si `user` tiene "@" busca por email, si no por username, en los dos casos sin distinguir mayúsculas (las cuentas que vienen del proveedor externo pueden tenerlas). Si dos filas difieren solo en mayúsculas (dato heredado), el login se rechaza y se loguea. | El frontend y los rate limiters (`loginUserRateLimiter` usa `req.body.user`) no cambian. El "@" separa sin ambigüedad email de username porque un username local no puede contenerlo (D11). |
| D11 | Identificadores | Email obligatorio, guardado en minúsculas. Username opcional: de 3 a 32 caracteres `a-z 0-9 . _`, sin "@", guardado en minúsculas y único sin distinguir mayúsculas. Las cuentas que vienen del proveedor externo (después de migrar) conservan el username que tenían. El formulario dice "Usuario o correo electrónico" en los dos modos, porque el proveedor externo también acepta el correo en ese campo. | El conjunto de caracteres es el mismo que reconocen las menciones (`utils/mention.ts`). Una cuenta sin username funciona igual, porque las menciones usan el nombre (`MentionAutocompleteList.tsx:48`, `MessageInput.tsx:170`). La clave i18n `auth.usernameOrEmail` ya existe (`es.ts:41`). |
| D12 | Anti-enumeración | Mismo mensaje y mismo status para "no existe", "contraseña incorrecta" y "sin contraseña asignada" (cuentas que vienen del proveedor externo, §10). Si no hay cuenta, o no tiene contraseña, se verifica igual contra un hash ficticio. Una cuenta bloqueada (D17) responde exactamente lo mismo que el rate limit de hoy. "Cuenta desactivada" (403) solo se informa si la contraseña era correcta. | La auditoría sí distingue los motivos (la tabla la lee un admin); la respuesta HTTP no. |
| D13 | Cambio de contraseña obligatorio | El login emite un token restringido (`pcr: true`) cuando un admin restableció la contraseña, cuando venció (D15) o cuando no cumple la política vigente (D16), e informa el motivo (`mustChangePasswordReason`). Ese token solo sirve para `PATCH /v1/auth/password`: cualquier otra ruta, y el socket, responden 403 con `code: "password_change_required"`. | Si se valida solo en el frontend, el token restringido sirve igual contra la API. Requiere que `AppError` acepte un `code` opcional y que `error.middleware.ts:18` lo serialice (`{ error, code }`) cuando existe. Hoy solo `ServiceUnavailableError` trae `code` (`provider_unreachable`/`provider_error`), y exponerlo es inocuo. |
| D14 | Configuración pública | `GET /v1/auth/config`, público → `{ mode, passwordPolicy? }`. La política solo viene en modo local, y solo con lo necesario para elegir una contraseña (largo, complejidad, historial): nunca la duración de sesión ni el bloqueo. | La pantalla de cambio obligatorio la necesita con un token `pcr`, que no puede leer `/settings/public`. El frontend necesita el modo para mostrar u ocultar la gestión de cuentas y de contraseñas. No con `NEXT_PUBLIC_*`: quedan embebidas en el build (`ecosystem.config.js:55-57`), y el backend tiene que ser la única fuente de verdad. |

### 4.4 Sesión y contraseñas del modo local, administrables por un admin

Todo vive en `AppSettings` (la fila singleton de *Configuración global*), no en el `.env`. Lo edita un
admin en runtime, el cache de proceso de `settings.service.ts` lo aplica al instante, y cada cambio ya
queda auditado por `UPDATE_SETTINGS` en la misma transacción, con diff `from`/`to`. Ninguno de estos
campos es secreto, que es la condición que pide `audit.types.ts:38-41` para diffearlos. Solo aplican
en modo local: en modo `externo` la sesión y las contraseñas las define el proveedor externo, y la sección no se muestra.

**D15 — Qué se configura:**

| Campo de `AppSettings` | Default | Rango | Qué hace |
|---|---|---|---|
| `localSessionTtlHours` | 12 | 1–720 | Duración de la sesión (token). |
| `passwordMinLength` | 12 | 8–128 | Largo mínimo. El piso de 8 (NIST SP 800-63B) no se puede bajar ni por API. |
| `passwordRequireUppercase`, `passwordRequireLowercase`, `passwordRequireNumber`, `passwordRequireSymbol` | `false` | — | Reglas de composición. Apagadas por defecto porque NIST las desaconseja (empujan a patrones previsibles como `Clave2026!`), pero disponibles porque muchas políticas corporativas las exigen. |
| `passwordExpirationDays` | `null` (no vencen) | 1–365 | Al vencer, el próximo login pide cambiarla. Misma salvedad: NIST desaconseja la rotación periódica. |
| `passwordHistoryCount` | 0 | 0–12 | No se pueden repetir las últimas N contraseñas. |
| `maxFailedLoginAttempts` | `null` (sin bloqueo) | 3–50 | Intentos fallidos seguidos que bloquean la cuenta (D17). |
| `lockoutDurationMinutes` | 15 | 1–1440 | Cuánto dura el bloqueo. |

Los defaults siguen el criterio del resto de `AppSettings`: nada cambia hasta que un admin lo decida.
Sin complejidad, sin vencimiento, sin historial y sin bloqueo. El único valor que rige desde el primer
día es el largo mínimo de 12, porque acá no hay un comportamiento anterior que preservar.

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| D16 | Cómo se aplica un cambio | **Duración de sesión:** bajarla corta también los tokens ya emitidos (`resolveInternalUser` compara `now - iat` contra el valor vigente); subirla no alarga ninguno, porque manda el `exp` firmado. **Política:** endurecerla no invalida nada en el momento; en el próximo login de cada cuenta, si su contraseña (que en ese instante se tiene en texto plano) no cumple, el token sale con `pcr`, motivo `policy`. **Vencimiento e historial:** se evalúan en cada login y en cada cambio de contraseña. El panel advierte estos efectos antes de guardar. | Endurecer una política sin aplicarla a las contraseñas existentes no protege nada, y forzar a todos en el acto (cortando sesiones) es desproporcionado. El próximo login es el único momento en que se puede verificar la contraseña sin guardar nada extra. Que bajar la duración corte sesiones abiertas es lo que un admin espera cuando la baja por un incidente. |
| D17 | Bloqueo por intentos fallidos | Por cuenta, en `LocalCredential` (`failedLoginCount` con incremento atómico, `lockedUntil`). Al llegar a `maxFailedLoginAttempts`, la cuenta queda bloqueada `lockoutDurationMinutes`, **aunque después llegue la contraseña correcta**. Un login exitoso reinicia el contador, y un admin puede desbloquearla. Mientras dura, responde `429` con el mismo mensaje del rate limit de hoy (`rate-limit.middleware.ts:4-6`). Auditoría `account_locked`. Apagado por defecto. | El rate limit actual vive en memoria (se pierde en cada reinicio) y cuenta por identificador escrito: el email y el username de una misma cuenta son dos cupos distintos. El bloqueo cuenta por cuenta y persiste. Responder igual que el rate limit evita confirmar que la cuenta existe. Va apagado por defecto porque también sirve para bloquear a alguien a propósito: lo decide el admin. Los rate limits globales (5 cada 15 min por usuario, 20 por IP) quedan fijos como hoy: protegen también el modo `externo` y los intentos con cuentas inexistentes. |

### 4.5 Administración y migración

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| D18 | Primer admin y emergencias (modo local) | CLI `backend/src/cli/auth-admin.ts` con dos comandos. `create-admin --email [--name] [--username]` crea la cuenta o, si ya existe una con ese correo (por ejemplo de la época el proveedor externo), le asigna credencial y rol admin conservando su historial. `reset-password --email` restablece una contraseña. Las contraseñas temporales se imprimen **una sola vez** en la terminal con `process.stdout.write` y dejan el cambio obligatorio. Solo corre en modo `local`. | Nunca por `logger`: terminaría en los archivos rotados de PM2 (LOGGING_PLAN §4.2). No necesita excepción en `no-console.test.ts`: no es un log de aplicación, es la salida de un comando para el operador. Descartados `BOOTSTRAP_ADMIN_PASSWORD` en el `.env` (una contraseña en texto plano para siempre en el server) y un asistente web de "primer arranque" (el primero que llega a la URL se vuelve admin). También es lo que arranca una migración de `externo` a `local` (§10): el primer admin local puede ser la misma cuenta que ya usaba. |
| D19 | Desactivar cuentas | Un admin puede desactivar (y reactivar) **cualquier** cuenta, en los dos modos (`UserStatus.INACTIVE`, que ya existe y hasta hoy nadie usaba). Nunca se borra. En modo `externo`, una cuenta desactivada no entra aunque el proveedor externo valide sus credenciales (403 `account_disabled`), y `syncAppUsers` nunca la reactiva. | Es la única forma de cortarle el acceso al chat a alguien sin depender del proveedor externo. Borrar rompería las FK de mensajes y auditoría. El directorio ya filtra `status: ACTIVE` (`user.repository.ts:18`): una cuenta desactivada desaparece del selector de contactos sin más cambios. |
| D20 | Migración entre modos | Sin conversión de cuentas: el modo es de la instalación y `User` no sabe con qué proveedor se autentica. **`externo` → `local`:** las cuentas existentes quedan sin contraseña hasta que un admin les asigne una, con su historial, nombre, foto y username intactos. **`local` → `externo`:** cada persona entra con el proveedor externo y su cuenta se reconoce por correo, como ya hace `upsertExternalUser`. En modo `externo` manda el username del proveedor externo: si otra fila lo tiene, se le quita y queda un `warn` (UUIDs, no emails: LOGGING_PLAN §4.4). Las credenciales locales quedan inactivas y sirven para volver atrás. | Convertir cuenta por cuenta solo tenía sentido con los dos modos a la vez. Con un modo por instalación, cambiar de modo es cambiar quién autentica a los mismos perfiles. Que el proveedor externo mande sobre el username corrige además un 500 latente de hoy (punto 9 del mapa). |
| D21 | Auditoría | `LOGIN` pasa a llevar `{ provider }`. `LOGIN_FAILED` suma `provider` y los motivos `unknown_account`, `wrong_password`, `no_credential`, `account_disabled` y `account_locked`. Acciones nuevas: `CREATE_USER`, `UPDATE_USER` (diff de nombre, email, username, estado, roles o bloqueo) y `RESET_PASSWORD`, que son de admin y van **en la misma transacción** que su efecto; y `CHANGE_PASSWORD` (propia, `record` fail-soft, con el motivo). Las de admin llevan `via` (`panel` o `cli`) y entran en `DEFAULT_ADMIN_AUDIT_ACTIONS`. Los cambios de §4.4 ya los cubre `UPDATE_SETTINGS`. | Mismo criterio que `modules/audit/README.md`, con sus 3 pasos obligatorios por acción. Las filas viejas de `LOGIN`/`LOGIN_FAILED` no tienen `provider`: quien las lea tiene que interpretar "ausente" como `externo`. Ninguna metadata lleva contraseñas, hashes ni tokens, ni siquiera su longitud. |

---

## 5. Modelo de datos

Todos los cambios de esquema entran juntos en la Fase 2, en una sola migración:

```prisma
model User {
  // ...campos existentes, sin cambios. En modo local, `username` es opcional
  // (D11); las cuentas que vienen del proveedor externo conservan el suyo.

  /// Roles en modo local. En modo externo se ignora: los roles vienen del JWT del proveedor externo.
  localRoles       String[]         @default([]) @map("local_roles")
  /// Modo local: los tokens con `iat` anterior se rechazan. Truncado al segundo.
  tokensValidAfter DateTime?        @map("tokens_valid_after")
  localCredential  LocalCredential?
}

/// Credenciales del modo local. Tabla aparte a propósito (D3). Un `User` sin
/// fila acá existe, pero en modo local no puede entrar hasta que un admin le
/// asigne una contraseña (por ejemplo, las cuentas que vienen del proveedor externo).
model LocalCredential {
  userId                 String    @id @map("user_id")
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// `scrypt$N$r$p$salt$hash` (ver modules/auth/password.ts). Nunca se loguea.
  passwordHash           String    @map("password_hash")
  /// Para `AppSettings.passwordHistoryCount`; se poda a N en cada cambio.
  previousPasswordHashes String[]  @default([]) @map("previous_password_hashes")
  mustChangePassword     Boolean   @default(true) @map("must_change_password")
  passwordChangedAt      DateTime  @default(now()) @map("password_changed_at")
  failedLoginCount       Int       @default(0) @map("failed_login_count")
  lockedUntil            DateTime? @map("locked_until")
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")

  @@map("local_credentials")
}

model AppSettings {
  // ...campos existentes...

  // Sesión y contraseñas del modo local (LOCAL_AUTH_PLAN.md §4.4). En modo
  // externo no aplican: la sesión y las contraseñas las define el proveedor externo.
  localSessionTtlHours     Int     @default(12) @map("local_session_ttl_hours")
  passwordMinLength        Int     @default(12) @map("password_min_length")
  passwordRequireUppercase Boolean @default(false) @map("password_require_uppercase")
  passwordRequireLowercase Boolean @default(false) @map("password_require_lowercase")
  passwordRequireNumber    Boolean @default(false) @map("password_require_number")
  passwordRequireSymbol    Boolean @default(false) @map("password_require_symbol")
  /// null = las contraseñas no vencen.
  passwordExpirationDays   Int?    @map("password_expiration_days")
  /// 0 = se puede repetir cualquier contraseña anterior.
  passwordHistoryCount     Int     @default(0) @map("password_history_count")
  /// null = sin bloqueo por cuenta (queda solo el rate limit en memoria de hoy).
  maxFailedLoginAttempts   Int?    @map("max_failed_login_attempts")
  lockoutDurationMinutes   Int     @default(15) @map("lockout_duration_minutes")
}

enum AuditAction {
  // ...valores existentes...
  /// Gestión de cuentas (LOCAL_AUTH_PLAN.md). Nunca llevan contraseña ni hash.
  CREATE_USER     @map("create_user")
  UPDATE_USER     @map("update_user")
  RESET_PASSWORD  @map("reset_password")
  CHANGE_PASSWORD @map("change_password")
}
```

- **Se elimina el enum `AuthProvider`** (`schema.prisma:17-28`). Estaba reservado para esto, pero el
  modo se deduce del `.env` y no se persiste en ningún lado: dejarlo sería código muerto que describe
  un diseño distinto del implementado. Ninguna columna lo usa, así que sacarlo no toca datos.
- Se aplica con la migración `backend/prisma/migrations/20261006150000_local_auth` (`npm run
  db:migrate`). Cuando se escribió este plan el repo usaba `prisma db push`; desde entonces usa
  migraciones (ver README.md, "Base de datos y migraciones"). Es un cambio aditivo (columnas con
  default o nullable, una tabla nueva, valores de enum nuevos), sin pérdida de datos. En producción,
  backup antes (`backend/README.md`, "Operaciones, Backup y Restauración").
- Comentarios que dejan de ser ciertos y hay que actualizar: `User.username` ("null cuando el usuario
  no proviene de un proveedor externo"), el comentario de `LOGIN` en `AuditAction` ("el JWT del proveedor externo
  es stateless": el local también lo es) y `GroupPermissionLevel` (`APP_ADMINS_ONLY` "viene del proveedor externo").

---

## 6. Variables de entorno

| Variable | Obligatoria en | Default | Notas |
|---|---|---|---|
| las variables del proveedor | — | — | Las tres → modo `externo`. Ninguna → modo `local`. Una o dos → error de arranque. |
| `LOCAL_AUTH_JWT_SECRET` | modo `local` | — | 32 caracteres o más. En modo `externo`, si está, se ignora con un `warn`. |
| `FILE_URL_SIGNING_SECRET` | nunca (recomendada) | el secreto del proveedor, si no `LOCAL_AUTH_JWT_SECRET` | Hoy el fallback es solo el proveedor externo (`file.service.ts:67`), que en modo local no existe. |

La duración de sesión y la política de contraseñas **no** van acá: son de un admin (§4.4).

```dotenv
# Modo externo — el .env de hoy, no hay que tocar nada.
la URL del proveedor="https://auth.example.com"
el código de la aplicación="chat-interno"
el secreto del proveedor="..."

# Modo local — sin ninguna variable del proveedor.
# Generar con: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
LOCAL_AUTH_JWT_SECRET="..."
```

---

## 7. Contratos de API

**`GET /api/v1/auth/config`** (público, sin token). En modo `externo` responde solo `{ "mode": "externo" }`:

```json
{
  "mode": "local",
  "passwordPolicy": {
    "minLength": 12,
    "maxLength": 128,
    "requireUppercase": false,
    "requireLowercase": false,
    "requireNumber": false,
    "requireSymbol": false,
    "historyCount": 0
  }
}
```

**`POST /api/v1/auth/login`**: mismo request que hoy; `user` puede ser un usuario o un correo, en los
dos modos. La respuesta suma `user.authProvider` (`"externo"` \| `"local"`), `user.mustChangePassword` y
`user.mustChangePasswordReason` (`"reset"` \| `"expired"` \| `"policy"` \| `null`). Ejemplo en modo local:

```json
{
  "token": "<jwt emitido por este backend, iss: link-local>",
  "user": {
    "id": "<uuid interno — en modo local es igual a internalUserId>",
    "email": "ana@empresa.com",
    "username": "ana.perez",
    "fullName": "Ana Pérez",
    "roles": ["admin"],
    "permissions": [],
    "app": "link",
    "exp": 1760000000,
    "internalUserId": "<uuid interno>",
    "authProvider": "local",
    "mustChangePassword": false,
    "mustChangePasswordReason": null,
    "notificationSoundEnabled": true,
    "language": "es"
  }
}
```

Errores en modo local: `401` genérico ("Usuario, correo o contraseña incorrectos"); `403` si la cuenta
está desactivada y la contraseña era correcta; `429` por el rate limit o por un bloqueo, con el mismo
mensaje en los dos casos. En modo `externo` los errores no cambian, salvo el `403` `account_disabled` de
D19.

**`PATCH /api/v1/auth/password`** (solo existe en modo local; en `externo` responde 404):
`{ currentPassword, newPassword }` → `200 { token, exp }`. El token nuevo reemplaza al actual, y todos
los anteriores quedan revocados.

- `400` con `code`: `invalid_current_password`, `password_policy` (con la lista de reglas que no
  cumple) o `password_reused`. **Nunca `401`:** `api-client.ts:62` trata cualquier 401 fuera del
  login como sesión vencida y desloguea.
- `429`: rate limit propio por `internalUserId` (5 cada 15 min), para que un token robado no permita
  fuerza bruta sobre la contraseña actual.

**Admin**, bajo `/api/v1/admin/users` (`requireRoles("admin")`). Las rutas "solo local" no se montan en
modo `externo` (404):

| Método y ruta | Modo | Body | Respuesta y reglas |
|---|---|---|---|
| `GET /` | los dos | — | En modo local, cada fila suma `localRoles`, `hasPassword`, `mustChangePassword` y `locked`. Filtros opcionales: `status` (los dos modos) y `hasPassword` (local). |
| `PATCH /:id` | los dos | `externo`: `{ status }`. `local`: `{ name?, email?, username?, roles?, status? }` | Nadie puede desactivarse ni degradarse a sí mismo, y en modo local no se puede dejar la instalación sin un admin activo (`409`). |
| `POST /` | solo local | `{ name, email, username?, roles?, password? }` | `201 { user, temporaryPassword? }`: la temporal se muestra una sola vez. `409` con `code` `email_taken` o `username_taken`. |
| `POST /:id/password-reset` | solo local | `{ password? }` | `200 { temporaryPassword }`. Deja el cambio obligatorio, desbloquea la cuenta, revoca sus tokens y desconecta sus sockets. |
| `POST /:id/unlock` | solo local | — | `204`. Reinicia el contador de intentos (D17). |

**Configuración global:** `GET/PATCH /api/v1/admin/settings` suman los campos de §4.4, con los rangos
de D15 validados en `settings.validator.ts`.

**Socket:** el handshake no cambia (`auth.token`). En modo local acepta tokens locales y rechaza los
que tienen `pcr`.

---

## 8. Invariantes de seguridad (cobertura obligatoria)

Igual que TESTING_PLAN §4: cualquier fase que toque estos puntos **tiene que** incluir un test que los
cubra explícitamente. No alcanza con que pase el camino feliz.

**Tokens e identidad**

1. **Un solo verificador.** En modo `local` no se acepta ningún token del proveedor externo (aunque esté bien
   firmado con el secreto que el proveedor externo usaba), y en modo `externo` ningún token local.
2. **Token local íntegro.** Firmado con otro secreto, con `iss`/`aud` incorrectos o con `alg: none` → rechazado.
3. **Revocación al segundo.** Un token emitido en el mismo segundo que `tokensValidAfter` es válido;
   uno anterior, no.
4. **Duración vigente.** Bajar `localSessionTtlHours` rechaza los tokens ya emitidos que la superan;
   subirla no alarga ninguno.
5. **Cuenta desactivada (los dos modos):** no inicia sesión (en `externo`, aunque el proveedor externo valide sus
   credenciales), sus tokens vigentes se rechazan, sus sockets se cortan y `syncAppUsers` nunca la reactiva.

**Login local**

6. **Anti-enumeración.** La respuesta es la misma para cuenta inexistente, contraseña incorrecta y
   cuenta sin contraseña, y el hash ficticio se ejecuta. Una cuenta bloqueada responde igual que el
   rate limit.
7. **Bloqueo.** Después de N fallos la cuenta queda bloqueada aunque llegue la contraseña correcta.
   Un login exitoso reinicia el contador, y el desbloqueo de un admin funciona.
8. **Cambio obligatorio.** Contraseña restablecida, vencida o fuera de política → el token solo sirve
   para cambiarla, y el socket lo rechaza.

**Contraseñas**

9. **Los secretos no quedan registrados en ningún lado.** Contraseña, hash, hashes anteriores y token
   nunca aparecen en logs, metadata de auditoría ni respuestas. Única excepción: `temporaryPassword`,
   una vez, para el admin que la generó.
10. **Política.** El piso de 8 caracteres no se puede bajar ni por la API de configuración; no se
    pueden repetir las últimas N contraseñas; y la contraseña temporal generada cumple cualquier
    política configurable.
11. **Contraseña actual incorrecta → 400, nunca 401** (ver `PATCH /auth/password` en §7).

**Administración y migración**

12. **Nunca sin admin.** En modo local no se puede dejar la instalación sin un admin activo, y en
    ningún modo alguien puede desactivarse o degradarse a sí mismo.
13. **En modo `externo` manda el username del proveedor externo.** Un username repetido nunca termina en 500, y una
    cuenta reconocida por correo conserva su `User.id` y, con él, su historial.

**Regresión**

14. **Con el `.env` actual** (solo las variables del proveedor), login, verificación, roles, directorio y foto se
    comportan exactamente como antes.

---

## 9. Fases

| # | Fase | Workspace | ¿Cambia algo visible? | Estado |
|---|---|---|---|---|
| 1 | [Configuración: El proveedor externo opcional](#fase-1) | backend | No, con el `.env` actual | [x] 2026-10-05 |
| 2 | [Modelo de datos y auditoría](#fase-2) | backend | No | [x] 2026-10-06 |
| 3 | [Núcleo local: contraseñas y tokens](#fase-3) | backend | No | [x] 2026-10-06 |
| 4 | [Autenticación según el modo: HTTP, socket y archivos](#fase-4) | backend | No, en modo `externo` | [x] 2026-10-06 |
| 5 | [Login local, contraseña propia y política básica](#fase-5) | backend | Sí, en modo local | [x] 2026-10-06 |
| 6 | [Política avanzada: vencimiento, historial y bloqueo](#fase-6) | backend | Solo si un admin la activa | [x] 2026-10-06 |
| 7 | [Administración de cuentas y CLI](#fase-7) | backend | Sí (en `externo`: desactivar cuentas) | [x] 2026-10-06 |
| 8 | [Migración entre modos](#fase-8) | backend | No (corrige un 500 latente) | [x] 2026-10-06 |
| 9 | [Frontend: login, cambio de contraseña y perfil](#fase-9) | frontend | Sí | [x] 2026-10-06 |
| 10 | [Frontend: panel de usuarios](#fase-10) | frontend | Sí | [x] 2026-10-06 |
| 11 | [Frontend: configuración de seguridad y auditoría](#fase-11) | frontend | Sí | [x] 2026-10-06 |
| 12 | [Documentación, versión y cierre](#fase-12) | ambos | — | [x] 2026-10-06 |

Las fases 1 a 4 se pueden llevar a producción en una instalación el proveedor externo sin riesgo funcional: es el
punto natural para un primer merge. La Fase 2 incluye una migración, así que conviene coordinarla con
un backup. La Fase 6 es separable: si se quiere una primera versión más chica, el modo local funciona
completo sin ella, con la duración de sesión, el largo mínimo y la complejidad configurables.

<a id="fase-1"></a>

### Fase 1 — Configuración: El proveedor externo opcional (backend)

Objetivo: el server arranca en los dos modos y, con el `.env` actual, nada cambia. Todavía no hay
login local.

- [x] `src/config/` → `resolveAuthConfig(rawEnv)` pura (D1 y D2), que devuelve
      `{ mode: "externo", externo } | { mode: "local", local }`. Error si el proveedor externo está a medias, o si en modo
      local falta `LOCAL_AUTH_JWT_SECRET` o es corto.
- [x] `src/config/env.ts`: las variables del proveedor opcionales y `LOCAL_AUTH_JWT_SECRET`. Invoca `resolveAuthConfig`
      dentro del `try` existente y expone la config resuelta. `server.ts` loguea el modo al arrancar.
- [x] Migrar cada uso de `env.las variables del proveedor` (los marca `tsc`) a la config resuelta: `auth.service.ts`,
      `jwt.ts` y `file.service.ts:67`, con la cadena de fallback de §6.
- [x] `backend/.env.example`: los dos modos y el comando para generar el secreto.

**Tests:** matriz de `resolveAuthConfig` (las tres el proveedor externo → `externo`; ninguna + secreto → `local`;
parcial → error; local sin secreto o con uno corto → error; `externo` con secreto local sobrante →
`warn`) y el fallback del secreto de firma de archivos en cada modo. Para probar el modo local en tests
de otros módulos, mockear `config/env` (patrón de `storage/index.test.ts`) o usar `vi.resetModules`
(patrón de `cors-origins.test.ts`).

**Hecha cuando:** la suite backend pasa **sin tocar `vitest.config.ts`** (sigue en modo `externo`) y
`npm run dev` con el `.env` actual arranca igual que antes.

**Fase 1 cerrada 2026-10-05.** Lo que la próxima fase tiene que saber:

- `env` ya no expone las variables de autenticación sueltas: solo `env.auth` (`AuthConfig`, en
  `src/config/auth-config.ts`). El código del proveedor externo pide su config con `requireProviderConfig(env.auth)`,
  que en modo local tira `ServiceUnavailableError` (`code: "provider_not_configured"`).
  `resolveAuthConfig` devuelve `{ config, warnings }`, y los avisos los loguea `server.ts`.
- Hasta la Fase 4, en modo local `authenticate` rechaza cualquier token: `verifyToken` tira y el
  middleware lo convierte en 401.
- Tests nuevos: `auth-config.test.ts` y `env.test.ts`; casos de modo local en `jwt.test.ts`,
  `auth.service.test.ts` y `file.service.test.ts`. `tsc` limpio y 812 tests en verde.
- Con el `.env` real de desarrollo, `env.auth.mode` resuelve a `externo` sin avisos.
- **Ajeno a esta fase:** `socket/registry.test.ts` y `socket/gateway.test.ts` fallan al importarse
  desde el commit `760a032`. Ese commit hizo que `call.service.ts` importe `push.service.ts`, que llama
  a `webpush.setVapidDetails` al cargarse y rechaza la clave VAPID ficticia de `vitest.config.ts`. Se
  verificó que fallan igual sin los cambios de esta fase.

<a id="fase-2"></a>

### Fase 2 — Modelo de datos y auditoría (backend)

- [x] `schema.prisma` según §5, incluida la baja del enum `AuthProvider`, con los comentarios
      actualizados. Migración `20261006150000_local_auth` (el repo pasó de `db push` a migraciones).
- [x] Auditoría, con los 3 pasos de `modules/audit/README.md` para todo lo de D21 de una vez: valores
      de `AuditAction`, `AuditMetadataMap`, la tabla del README y `DEFAULT_ADMIN_AUDIT_ACTIONS`.
      `LOGIN` pasa a `{ provider }` y `LOGIN_FAILED` suma `provider`: el flujo el proveedor externo actual manda
      `provider: "externo"`.

**Tests:** el login el proveedor externo (éxito y fallo) audita con `provider: "externo"`; el resto de la suite sigue igual.

**Hecha cuando:** la migración se aplica sin pérdida de datos sobre una base con datos.

**Fase 2 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- La migración se validó en un PostgreSQL descartable: sobre `0_init` con datos previos (un usuario,
  la configuración y una fila de auditoría) se aplica sin perder nada, los campos nuevos toman sus
  defaults y `migrate diff --exit-code` no deja diferencia con el schema. **No** se aplicó a la base
  de desarrollo de nadie: en una instalación existente, `npm run db:baseline` una vez (si venía de
  `db push`) y después `npm run db:migrate`.
- `audit.types.ts` exporta `LoginFailureReason`, `AccountAdminVia`, `PasswordChangeReason` y
  `AuditedUserField`. `LOGIN` exige `metadata: { provider }`: TypeScript marca cualquier `record`
  que lo olvide. El controller usa `env.auth.mode` como `provider`.
- `DEFAULT_ADMIN_AUDIT_ACTIONS` suma `CHANGE_PASSWORD` además de las tres de admin: es un evento de
  seguridad de la cuenta, como `LOGIN`, y no actividad del chat. Un test fija que el default nunca
  incluya acciones del chat.
- La tabla del README de auditoría también documenta `START_CALL` y `END_CALL`, que faltaban.

<a id="fase-3"></a>

### Fase 3 — Núcleo local: contraseñas y tokens (backend, sin endpoints)

- [x] `modules/auth/password.ts`:
  - `hashPassword` y `verifyPassword` → `{ valid, needsRehash }` (D4).
  - `evaluatePasswordPolicy(password, policy)` → lista de reglas incumplidas. Aplica el piso de 8 y el
    máximo de 128 aunque la política recibida diga otra cosa.
  - `isPasswordReused(password, hashes)`.
  - `generateTemporaryPassword(policy)`: `crypto.randomInt` sobre un alfabeto sin caracteres
    ambiguos, de largo `max(16, minLength)`, y con al menos una mayúscula, una minúscula, un número y
    un símbolo, para que cumpla cualquier política configurable.
- [x] `modules/auth/jwt.ts`: `signLocalToken(user, { ttlHours, mustChangePassword })` y
      `verifyAccessToken(token)` → `AuthenticatedIdentity { mode, user: MappedUser,
      mustChangePassword, iat }`, con el verificador del modo activo (D5 y D6). `verifyToken` (El proveedor externo)
      queda como implementación del verificador el proveedor externo.
- [x] `auth.types.ts`: `MappedUser` suma `authProvider: "externo" | "local"` y `username` pasa a
      `string | null`. Documentar que en modo local `id === internalUserId` y `permissions: []`.

**Tests (invariantes 1, 2 y 10):**
- Contraseñas: round-trip; contraseña incorrecta; hash adulterado o de formato desconocido;
  `needsRehash` con parámetros viejos; NFKC; límites de largo; cada regla de composición; historial.
- Contraseña temporal: cumple la política más estricta posible.
- Token local: válido, vencido, firmado con otro secreto, con `iss` o `aud` incorrectos, y con
  `alg: none`.
- Verificador según el modo: en `local`, un token con forma del proveedor externo se rechaza aunque esté bien
  firmado; en `externo`, un token local se rechaza.

**Fase 3 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `password.ts` exporta `PASSWORD_MIN_LENGTH_FLOOR` (8), `PASSWORD_MAX_LENGTH` (128),
  `effectiveMinLength`, `PasswordPolicy` y `PasswordRule` (`min_length`, `max_length`, `uppercase`,
  `lowercase`, `number`, `symbol`), además de las funciones del plan. Los largos se cuentan en code
  points después de NFKC. "Símbolo" es cualquier caracter que no sea letra, número ni marca
  diacrítica (un espacio cuenta).
- `verifyPassword` nunca tira: un hash adulterado, de formato desconocido o con parámetros que
  pedirían más de 64 MiB da `valid: false`. Una contraseña de más de 128 caracteres también, sin
  calcular el hash.
- `auth-config.ts` suma `requireLocalConfig` (en modo externo tira 503 `local_auth_not_enabled`), que
  usa `signLocalToken`.
- `verifyAccessToken` en modo externo además rechaza tokens con `iss: "link-local"` o sin `email` y
  `roles`: así un token local no pasa ni si alguien usó el mismo valor en el secreto del proveedor y
  `LOCAL_AUTH_JWT_SECRET`. En modo local la identidad sale con `fullName: ""`, `username: null` y
  `roles: []`: los completa `resolveInternalUser` (Fase 4) desde la base.
- Helper de tests `src/test/auth-mode.ts`: `useAuthMode(LOCAL_AUTH_CONFIG)` dentro de un `describe`
  pone la instalación en modo local y restaura externo al terminar.
- `tsc` limpio y 885 tests en verde.

<a id="fase-4"></a>

### Fase 4 — Autenticación según el modo: HTTP, socket y archivos (backend)

- [x] `resolveInternalUser(identity)` (D7), compartida, por ejemplo en `modules/auth/identity.ts`.
      Incluye el control de antigüedad contra `localSessionTtlHours`, que se lee de `getSettings()`
      (en cache).
- [x] `authenticate` usa `verifyAccessToken` y aplica el gate de `pcr` (D13). `AppError` acepta un
      `code` opcional y `error.middleware.ts` lo serializa cuando existe.
- [x] `attachInternalUser`, `socket-auth.middleware.ts` (que además rechaza `pcr`) y la rama Bearer de
      `file.controller.ts#getContent` usan la función compartida. Se eliminan las dos copias.
- [x] Login el proveedor externo: una cuenta `INACTIVE` → 403 `account_disabled`, auditado como `LOGIN_FAILED` (D19).
- [x] `user.controller.ts`/`user.service.ts`: `syncAppUsers` solo en modo `externo`.
- [x] `socket/rooms.ts`: `disconnectUserSockets(io, userId)`.
- [x] Actualizar los tests que mockean `verifyToken`/`mapTokenToUser` (punto 14 del mapa) al contrato
      nuevo, **sin cambiar lo que esperan** en modo `externo`.

**Tests (invariantes 1, 3, 4, 5, 8 y 14):**
- Verificador: cada modo rechaza el token del otro, en HTTP, socket y archivos.
- Cuentas desactivadas: login el proveedor externo rechazado, tokens rechazados en los dos modos, y `syncAppUsers` no
  cambia `status`.
- Modo local: `tokensValidAfter` en el mismo segundo y un segundo antes; token más viejo que la
  duración vigente; roles leídos de la base.
- `requireRoles` sin `attachInternalUser` falla cerrado para un admin local.
- `pcr` solo pasa por `PATCH /auth/password`, y el socket lo rechaza.
- En modo local el directorio no llama al proveedor externo.

**Hecha cuando:** con el `.env` actual, todas las suites existentes pasan sin cambiar sus expectativas.

**Fase 4 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `modules/auth/identity.ts`: `resolveInternalUser`, `assertNotPasswordChangeOnly` y
  `authenticateAccessToken` (verifica, rechaza `pcr` y resuelve; la usan el socket y
  `/files/:id/content`). Los rechazos son `UnauthorizedError` con `code`: `account_disabled`,
  `token_revoked` y `session_expired`. Un token restringido es `ForbiddenError`
  `password_change_required` (403, no 401: el frontend cierra la sesión ante un 401).
- `authenticate` deja también `req.authIdentity` (modo, `iat`, `pcr`), que lee
  `attachInternalUser`. `authenticateForPasswordChange` es la variante que acepta tokens `pcr`:
  la Fase 5 la monta en `PATCH /auth/password`.
- `AppError` acepta `code`, y el error handler devuelve `{ error, code }` cuando hay. Nuevo
  `TooManyRequestsError` (429) para el bloqueo de cuentas.
- El socket sigue devolviendo solo `Token expired` o `Invalid token`, los dos mensajes con los que el
  frontend cierra la sesión: una cuenta desactivada, un token revocado o un `pcr` salen como
  `Invalid token`, y una sesión más vieja que la duración vigente como `Token expired`.
- Cambio de comportamiento a propósito: el login del proveedor externo ya no reenvía `CF-Connecting-IP` sin
  condición; usa `getClientIp` (config/client-ip.ts), igual que el rate limiting.
- `/files/:id/content` con un Bearer inválido ahora responde 401; antes llegaba como 500.
- Las cuentas mockeadas en los tests de rutas tienen `status: "ACTIVE"`: `resolveInternalUser`
  rechaza cualquier otro estado (falla cerrado).
- `tsc` limpio y 922 tests en verde.

<a id="fase-5"></a>

### Fase 5 — Login local, contraseña propia y política básica (backend)

- [x] Configuración global: `settings.validator.ts` suma `localSessionTtlHours`, `passwordMinLength`
      y los cuatro `passwordRequire*`, con los rangos de D15, también en la lista del test
      `at-least-one-field`. `settings.types.ts` (`UpdateSettingsInput`) y
      `settings.service.ts#getLocalAuthPolicy()`, con los pisos ya aplicados. Los campos de la Fase 6
      quedan afuera del validator hasta esa fase, para que nadie configure algo que todavía no se aplica.
- [x] `GET /v1/auth/config` (D14).
- [x] `AuthService.authenticateCredentials(user, password, clientIp)`: rama el proveedor externo sin cambios. Rama
      local, en este orden:
  1. Búsqueda por email o username (D10).
  2. Verificación, con hash ficticio si no hay cuenta o contraseña (D12).
  3. `status`.
  4. Rehash si `needsRehash`.
  5. Contraseña restablecida o fuera de la política vigente → `pcr` con su motivo (D16).
  6. Token con la duración de `getLocalAuthPolicy()` y la respuesta de §7.

  Los errores llevan el motivo explícito para la auditoría: los tipos de error HTTP no alcanzan para
  distinguir `unknown_account` de `wrong_password`, que a propósito comparten la misma respuesta.
  `mapLoginFailureReason` se extiende para leerlo.
- [x] `PATCH /v1/auth/password` (solo modo local): contraseña actual y política; mueve
      `tokensValidAfter` y devuelve un token nuevo; rate limiter propio por `internalUserId`; auditoría
      `CHANGE_PASSWORD` con su motivo.
- [x] `config/logger.ts`: `REDACT_PATHS` suma `currentPassword`, `newPassword`, `temporaryPassword`,
      `passwordHash` y `previousPasswordHashes`, con sus variantes `*.`.
- [x] `modules/auth/README.md`, `settings/README.md` (tabla "Consumidores") y `API.md` §1, §2 y §12.
- [x] Sacar las notas de "el inicio de sesión local todavía está en desarrollo" que dejó la Fase 1 en
      `backend/.env.example`, `modules/auth/README.md`, `backend/README.md` y `API.md` §11.

**Tests (invariantes 6, 8, 9, 10 y 11):**
- Login local:
  - Por email y por username, sin distinguir mayúsculas.
  - Mensaje idéntico para inexistente, incorrecta y sin contraseña, y el hash ficticio se ejecuta.
  - Cuenta desactivada con contraseña correcta → 403.
  - Contraseña restablecida o fuera de política → `pcr` con el motivo correcto.
- Cambio de contraseña:
  - Actual incorrecta → 400, nunca 401.
  - Política.
  - Devuelve un token nuevo y el viejo queda revocado.
  - En modo `externo` la ruta no existe.
- Configuración:
  - Piso de 8 en el validator.
  - Un `PATCH` con un solo campo nuevo pasa el test `at-least-one-field`.
  - `/auth/config` no expone la duración.
- Privacidad: ninguna metadata de auditoría ni línea de log contiene la contraseña (assert sobre un
  logger de test, como en `logger.test.ts`).

**Fase 5 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- El login local vive en `local-auth.service.ts` (`loginWithLocalAccount`, `changeOwnPassword`,
  `getPublicAuthConfig`), no dentro de `AuthService`: la rama el proveedor externo del controller quedó sin cambios
  y sus tests también. `LocalLoginError` (`auth.errors.ts`) lleva el motivo para la auditoría y
  `mapLoginFailureReason` lo lee.
- La Fase 6 tiene que insertar el chequeo de bloqueo **antes** de `verifyPassword` en
  `loginWithLocalAccount`, incrementar `failedLoginCount` en los tres fallos y reiniciarlo en el
  éxito, y sumar `expired` a `mustChangePasswordReason`. `savePasswordChange` ya recibe
  `previousPasswordHashes` (hoy pasa el array sin tocar) y ya reinicia el contador y el bloqueo.
- Decidido en esta fase: la contraseña nueva nunca puede ser igual a la actual (`password_reused`),
  aunque el historial esté en 0. Si no, un cambio obligatorio por vencimiento se anularía volviendo
  a poner la misma.
- `AppError` acepta `details` (campos extra en la respuesta, como `rules`); `BadRequestError` lo
  expone. `requireAuthMode(mode)` responde 404 en el otro modo, decidido en cada request.
- `passwordChangeRateLimiter`: 5 intentos fallidos cada 15 minutos por `internalUserId`.
- Los tests del controller mockean `local-auth.service`: importarlo de verdad arrastra el socket
  (`getIO`) y con él `web-push`, que rechaza las claves VAPID de prueba.
- `tsc` limpio y 960 tests en verde.

<a id="fase-6"></a>

### Fase 6 — Política avanzada: vencimiento, historial y bloqueo (backend)

- [x] `settings.validator.ts`: `passwordExpirationDays`, `passwordHistoryCount`,
      `maxFailedLoginAttempts` y `lockoutDurationMinutes` (rangos de D15, también en
      `at-least-one-field`).
- [x] Login: bloqueo antes de verificar (D17); incremento atómico del contador si falla y reinicio si
      sale bien; `429` con el mensaje del rate limit; auditoría `account_locked`. Contraseña vencida →
      `pcr` con motivo `expired`.
- [x] `PATCH /v1/auth/password`: historial; guarda el hash saliente en `previousPasswordHashes`,
      podado a N.
- [x] `/auth/config` suma `historyCount`.

**Tests (invariantes 7 y 10):**
- Bloqueo con y sin la contraseña correcta, y reinicio del contador.
- Vencimiento.
- Repetir una de las últimas N contraseñas se rechaza; una más vieja que N se acepta.
- Con los defaults (todo apagado), el login se comporta igual que en la Fase 5.

**Fase 6 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `historyCount` cuenta la actual: "no se pueden repetir las últimas N" incluye la vigente. La
  saliente pasa a `previousPasswordHashes` y se poda a N-1, así que con la nueva son N. Con 0 o 1
  solo se compara contra la actual, que nunca se puede repetir (decisión de la Fase 5).
- El contador de fallos solo corre con el bloqueo activado: si un admin lo activa más tarde, los
  fallos de antes no cuentan. Al bloquear, el contador vuelve a 0 (al vencer el bloqueo hay otra vez
  N intentos). Solo cuentan las contraseñas incorrectas de cuentas con credencial.
- Al bloquearse una cuenta queda un `warn` con su UUID (`local account locked after too many failed
  logins`). El intento que la bloquea se audita como `wrong_password`; los siguientes, mientras dure,
  como `account_locked`.
- La Fase 7 tiene que implementar el desbloqueo de un admin (`POST /admin/users/:id/unlock`) con
  `resetFailedLogins` y el `UPDATE_USER` con `locked` en el diff. `getLocalAuthPolicy()` aplica topes
  aunque la fila tenga valores fuera de rango (bloqueo ≥ 3, historial ≤ 12, duración ≥ 1 minuto).
- Límite conocido, aceptado por el diseño (D17): con `maxFailedLoginAttempts` por debajo del rate
  limit por usuario (5), quien prueba muchas contraseñas puede notar que una cuenta existe porque
  recibe el `429` antes que con una inexistente. El bloqueo está apagado por defecto; conviene
  mencionarlo junto al campo en el panel (Fase 11).
- `tsc` limpio y 976 tests en verde.

<a id="fase-7"></a>

### Fase 7 — Administración de cuentas y CLI (backend)

- [x] Los dos modos: `PATCH /admin/users/:id` con `status`. Desactivar o reactivar, con
      auto-protección; desconecta sockets y, en modo local, mueve `tokensValidAfter`.
- [x] Solo modo local:
  - Endpoints de alta, edición (nombre, email, username, roles), restablecimiento y desbloqueo (§7).
  - Reglas: formato y unicidad de email y username (D11), roles solo de una lista conocida
    (`ADMIN_ROLE`), y "último admin activo".
- [x] Efecto y auditoría en la misma transacción: `CREATE_USER`, `UPDATE_USER` (con un diff sin
      secretos) y `RESET_PASSWORD`, todas con `via`.
- [x] `listUsersForAdmin`: campos y filtros de §7 según el modo.
- [x] CLI `src/cli/auth-admin.ts` con `create-admin` (cuenta nueva o existente) y `reset-password`
      (D18). Script npm: `ts-node` en desarrollo y `node dist/cli/auth-admin.js` en producción. Para la
      auditoría usa un contexto de ejecución como el de `workers/worker-context.ts`.
- [x] `users/README.md`: deja de decir que el módulo "nunca crea usuarios", y cambian las secciones de
      `status` y de roles. También `API.md` §14.

**Tests (invariantes 5, 9 y 12):**
- Cada regla del service, en cada modo.
- Desactivar una cuenta el proveedor externo corta sus sockets.
- Transacción: si falla la auditoría, el cambio no se aplica.
- CLI, con un stream de salida inyectado:
  - La contraseña sale solo por ahí y por ningún logger.
  - `create-admin` sobre un correo existente conserva el `User.id`.
  - Se niega a correr en modo `externo`.

**Fase 7 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `users/account-admin.service.ts` (`updateUserAccount`, `createLocalUser`, `resetLocalPassword`,
  `unlockLocalUser`, `bootstrapAdmin`, `resetPasswordByEmail`) y su repositorio, que usa una transacción
  interactiva: lee, decide ("último admin", unicidad) y escribe con la auditoría en la misma
  transacción. Un `P2002` del índice único se traduce a `409`.
- Los `409` llevan `code`: `cannot_modify_self`, `last_admin`, `email_taken`, `username_taken`. El
  username vacío o `null` se borra.
- `PATCH /admin/users/:id` valida el body según el modo en cada request (`validateUpdateAccount`).
  En externo solo `status`; el servicio además ignora cualquier otro campo en ese modo.
- Una contraseña elegida por el admin (alta o restablecimiento) tiene que cumplir la política; la
  restablecida pasa la anterior al historial, igual que un cambio propio.
- `modules/auth/live-sessions.ts#endLiveSessions` corta sockets sin fallar en procesos sin Socket.IO
  (`socket/index.ts#isSocketReady`). Lo usan el cambio de contraseña, el restablecimiento y la
  desactivación. En el CLI no hay sockets que cortar: los tokens quedan revocados igual.
- CLI: `npm run auth:admin` corre `dist/cli/auth-admin.js` (producción y Docker) y
  `npm run auth:admin:dev` usa ts-node. `bootstrapAdmin` sin `--name` usa la parte del correo antes de
  la "@". Sobre una cuenta existente la reactiva si estaba desactivada.
- `ASSIGNABLE_LOCAL_ROLES` vive en `constants/roles.constant.ts`, para que el validador no arrastre
  el socket.
- Prueba de punta a punta contra un PostgreSQL descartable: `create-admin`, login con la temporal
  (token `pcr`, 403 en el resto de la API), cambio de contraseña (el token viejo queda revocado),
  acceso al panel con el token nuevo, alta y desactivación de una cuenta, y `409` al intentar
  desactivarse a sí mismo. Sin errores en el log.
- `tsc` limpio y 1030 tests en verde.

<a id="fase-8"></a>

### Fase 8 — Migración entre modos (backend)

- [x] `auth.repository.ts#upsertExternalUser`: el username del proveedor externo manda (D20). Si otra fila lo
      tiene, en la misma transacción se le pone `null` y queda un `warn` con los UUIDs.
- [x] Tests que reproducen el procedimiento de §10, con mocks:
  - `local` → `externo`: un login el proveedor externo con el correo de una cuenta local la adopta, con el mismo
    `User.id` (y su historial), aunque el correo difiera en mayúsculas. Un username repetido se
    resuelve sin 500.
  - `externo` → `local`: `create-admin` sobre una cuenta existente conserva su `User.id` y le da
    credencial y rol admin. Las cuentas sin contraseña reciben el 401 genérico, auditado como
    `no_credential`.
- [x] `backend/README.md`, "Proveedor de Autenticación": cómo se elige el modo, y un puntero al
      procedimiento de §10.

**Tests:** los de arriba (invariante 13).

**Fase 8 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `upsertExternalUser` busca por correo exacto y, si no hay, sin distinguir mayúsculas. Al adoptar
  una cuenta con el correo en otras mayúsculas, guarda el del proveedor externo, porque `resolveInternalUser` en
  modo externo busca por el correo exacto del token.
- Sin transacción interactiva a propósito: `syncAppUsers` llama a esta función para cada usuario de
  la app en paralelo, en cada `GET /users`, y cientos de transacciones interactivas agotarían el pool.
  El caso común son dos lecturas y una escritura, como antes más una lectura. Solo cuando otra cuenta
  tiene el username del proveedor externo hay una transacción por lotes, que se lo quita y aplica el cambio.
- Tests del procedimiento de §10: adopción por correo con otras mayúsculas y username repetido
  resuelto sin 500 (`auth.repository.test.ts`); `create-admin` sobre una cuenta existente que conserva
  su `User.id` (`account-admin.service.test.ts`); cuenta sin contraseña con el 401 genérico, auditada
  como `no_credential` (`local-auth.service.test.ts`).
- `backend/README.md` ya no menciona el enum `AuthProvider` (se eliminó en la Fase 2) y resume el
  procedimiento de §10.
- `tsc` limpio y 1033 tests en verde. **Termina la parte backend del plan.**

<a id="fase-9"></a>

### Fase 9 — Frontend: login, cambio de contraseña y perfil

Antes de escribir UI, leé [frontend/AGENTS.md](../../frontend/AGENTS.md): la versión de Next.js tiene cambios
que rompen respecto de lo habitual.

- [x] `auth.api.ts`: `getAuthConfig` y `changePassword`. `auth.types.ts`: `authProvider`,
      `mustChangePassword`, `mustChangePasswordReason` y `username: string | null`. `ApiError` suma
      `code`. La config pública se pide una vez al cargar la app.
- [x] `LoginForm`: la etiqueta pasa a `auth.usernameOrEmail` en los dos modos. En modo local suma la
      ayuda "¿Olvidaste tu contraseña? Pedile a un administrador que la restablezca".
- [x] `AuthProvider`:
  - Con `session.user.mustChangePassword`, renderiza la pantalla de cambio obligatorio **en lugar de
    `children`**. Así `ProfilePicture`, `PublicSettings`, `Socket` y `Call`
    (`app-providers.tsx:18-28`) ni se montan con un token restringido.
  - La pantalla explica el motivo (restablecida, vencida o fuera de política) y muestra en vivo las
    reglas de `passwordPolicy`.
  - Al terminar, actualiza `token` y `exp` en la sesión; el socket reconecta solo porque depende de
    `session`.
- [x] `ProfileSettingsPanel`: sección "Seguridad → Cambiar contraseña", solo en modo local.
- [x] i18n `es` y `en`.

**Tests:**
- Login: etiqueta y ayuda según el modo.
- Cambio obligatorio: no monta el socket hasta cambiar la contraseña; muestra cada motivo y las reglas
  de la política.
- Perfil: la sección solo aparece en modo local.
- Errores: una contraseña actual incorrecta muestra el error y **no** cierra la sesión.
- Actualizar `test/integration/login-flow.test.tsx` y el usuario de `test/test-utils.tsx`.

**Fase 9 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- `providers/auth-config-provider.tsx` pide `GET /auth/config` una vez y expone `useAuthConfig()`
  (`{ config, refresh }`). Sin provider o si el backend no responde, `config` es `null` y los
  componentes se comportan como en modo externo. Va fuera de `AuthProvider` porque el login la
  necesita sin sesión.
- Para saber si la sesión es local, usar `session.user.authProvider === "local"` (ausente = externo,
  por las sesiones guardadas de antes). `AuthUser.username` ahora es `string | null`.
- `ApiError` suma `code` y `body` (el body completo, para leer `rules`).
- `AuthProvider` expone `completePasswordChange(token, exp)` y, con
  `session.user.mustChangePassword`, renderiza `ForcedPasswordChange` en lugar de `children`. El
  `SocketProvider` y el resto ni se montan con el token restringido: la sesión guardada se carga
  después del primer render, y en ese render todavía no hay sesión.
- Componentes reutilizables: `ChangePasswordForm` (pantalla obligatoria y perfil) y
  `PasswordRulesList`; las reglas del cliente (`utils/password-rules.ts`) copian las del backend solo
  para mostrar qué falta, la autoridad es el backend.
- Los mocks de `useAuth` en los tests suman `completePasswordChange: vi.fn()`.
- `tsc` limpio y 1004 tests del frontend en verde.

<a id="fase-10"></a>

### Fase 10 — Frontend: panel de usuarios

- [x] `admin-users.api.ts`, tipos y hooks: estado en los dos modos; alta, edición, restablecimiento y
      desbloqueo en modo local.
- [x] `AdminUsersPanel`: el aviso de solo lectura de hoy (dice "hacelo desde el proveedor externo", `es.ts:492`) se
      reemplaza por uno según el modo:
  - En `externo`: los datos de cada cuenta se administran en el proveedor externo; desde acá solo se desactiva o
    reactiva su acceso al chat.
  - En `local`: botón "Crear cuenta" y filtro "sin contraseña" (útil después de migrar).
- [x] `AdminUserRow`:
  - Badge de estado en los dos modos.
  - En `externo`: "Sincronizado con el proveedor externo / Editado localmente".
  - En `local`: admin, bloqueada, sin contraseña y cambio pendiente.
  - Acciones según el modo.
- [x] Modal de alta y edición (local): username opcional, con su formato.
- [x] Modal que muestra la contraseña temporal **una sola vez**, con botón copiar y el aviso de que no
      se vuelve a mostrar.

**Tests:**
- Cada componente y hook nuevo.
- Acciones y avisos según el modo.
- La contraseña temporal no queda en ningún estado persistido (localStorage, borradores).

**Fase 10 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- El panel saca el modo de `session.user.authProvider` (ausente = externo), igual que el perfil. La
  Fase 11 puede hacer lo mismo en `AdminSettingsPanel`.
- `hooks/use-admin-user-actions.ts` concentra alta, edición, restablecimiento y desbloqueo: cada
  acción devuelve el resultado o `null`, y el error queda en `error`, ya traducido para los
  `code` que conoce (`cannot_modify_self`, `last_admin`, `email_taken`, `username_taken`).
- La contraseña temporal solo vive en el estado de `AdminUsersPanel` mientras está abierto
  `TemporaryPasswordModal`; el hook no la guarda. Hay un test que verifica que no llega a
  `localStorage`.
- `AdminUserRow` sigue funcionando sin props nuevas (solo lectura, modo externo): las acciones
  aparecen solo si se pasan sus handlers, y las del modo local, solo con `mode="local"`. Desactivar
  y restablecer piden confirmación en la misma fila.
- El filtro de estado está en los dos modos; "sin contraseña", solo en el local.
- `tsc` limpio y 1045 tests del frontend en verde.

<a id="fase-11"></a>

### Fase 11 — Frontend: configuración de seguridad y auditoría

- [x] `admin-settings.types.ts` y `AdminSettingsPanel`: sección nueva "Sesión y contraseñas", solo en
      modo local. Valida los rangos de D15 en el cliente y advierte los efectos de D16 antes de guardar.
- [x] `audit-action-labels.constant.ts`: etiquetas y `DEFAULT_ADMIN_ACTIONS` espejadas del backend.
      `AdminAuditRow` muestra `provider`, `reason` y `via`.

**Tests:**
- La sección solo aparece en modo local.
- Validación de rangos.
- Las advertencias aparecen al bajar la duración o endurecer la política.
- Etiquetas de las acciones nuevas.

**Fase 11 cerrada 2026-10-06.** Lo que la próxima fase tiene que saber:

- La sección "Sesión y contraseñas" va al final de `AdminSettingsPanel` y solo se monta con
  `session.user.authProvider === "local"`. En modo externo sus campos ni se validan ni se envían: el
  payload del `PATCH` queda igual que antes del modo local.
- Los rangos del cliente (`LOCAL_AUTH_RANGES`) copian los de `settings.validator.ts`; la autoridad
  sigue siendo el backend. Sin bloqueo (`maxFailedLoginAttempts` vacío), la duración del bloqueo
  queda deshabilitada y no se envía.
- Advertencias de D16 antes de guardar, comparando contra lo guardado: bajar la duración de sesión,
  endurecer la política (largo mínimo mayor o una regla nueva) y activar o acortar el vencimiento.
  Junto al bloqueo va la nota de enumeración de D17. Subir el historial no advierte nada: solo rige
  en el próximo cambio de contraseña.
- `AdminAuditRow` muestra proveedor, motivo y origen (`via`) como chips junto a la acción. El
  proveedor solo se lee en `LOGIN`/`LOGIN_FAILED` (ausente = el proveedor externo): en `ADMIN_DELETE_FILE`,
  `provider` es el almacenamiento del archivo. Un motivo sin traducción se muestra crudo.
- Las cuatro acciones nuevas están en `AUDIT_ACTION_LABELS` (y por eso en el filtro "Todas las
  acciones"), en `DEFAULT_ADMIN_ACTIONS` y en `es`/`en`. El aviso del filtro por omisión ya
  nombra contraseñas y cuentas.
- `tsc` limpio y 1070 tests del frontend en verde.

<a id="fase-12"></a>

### Fase 12 — Documentación, versión y cierre

- [x] `settings/README.md:14`, `constants/roles.constant.ts` ("este backend no define ni asigna
      roles") y `frontend/.../admin-role.constant.ts`: los roles vienen del proveedor externo o de la base, según
      el modo.
- [x] `LOGGING_PLAN.md` §4.2: sumar `LOCAL_AUTH_JWT_SECRET` a la lista de secretos que nunca se loguean.
- [x] `TESTING_PLAN.md` §4: un puntero a las invariantes de §8 de este plan.
- [x] `CHANGELOG.md` y versión según [VERSIONING.md](../../VERSIONING.md) (funcionalidad nueva → minor).
- [x] Repaso final: grep de "El proveedor externo" en documentación y comentarios. Frases como "el backend nunca emite
      su propio token", "este módulo no administra usuarios ni contraseñas" o "los roles vienen
      exclusivamente del JWT del proveedor externo" pasan a ser ciertas solo en modo `externo`, y hay que decirlo.

**Fase 12 cerrada 2026-10-06. Plan completo.** Notas de cierre:

- Los roles (`settings/README.md`, `roles.constant.ts`, `admin-role.constant.ts`, `API.md` (permisos de grupos) y
  `conversations/README.md`) dicen de dónde salen en cada modo.
- `LOGGING_PLAN.md` §4, regla 2, suma `LOCAL_AUTH_JWT_SECRET`, los hashes y las contraseñas
  temporales. `TESTING_PLAN.md` §4 apunta a las invariantes de §8.
- `CHANGELOG.md`: las entradas quedan en `[Unreleased]`, como pide VERSIONING.md §4 durante el
  desarrollo. La próxima versión que las publique tiene que ser **minor** (`1.1.0` desde `1.0.1`)
  como mínimo; numerarla y fecharla es el procedimiento de publicación de VERSIONING.md §5
  (`npm run version:sync`), que no se hizo acá. La entrada de la Fase 1 ("el inicio de sesión local
  todavía está en desarrollo") se reemplazó por la funcionalidad completa.
- README raíz: el aviso de "Estado del proyecto" que decía que el modo local no permitía iniciar
  sesión se reemplazó, y la sección "Autenticación" e "Inicio rápido" explican cómo crear el primer
  admin (`create-admin`, con y sin Docker).
- Repaso de "El proveedor externo": se ajustaron los comentarios de `route.ts`, `socket/middleware.ts`,
  `profile-picture-provider.tsx` y `socket/README.md`. Lo que sigue hablando solo del proveedor externo está
  dentro de una sección o rama explícitamente del modo externo.

---

## 10. Cambiar de modo en una instalación existente

| De → a | Pasos | Qué pasa con las cuentas |
|---|---|---|
| `externo` → `local` | 1) Backup. 2) En el `.env`, sacar las las variables del proveedor y agregar `LOCAL_AUTH_JWT_SECRET`; reiniciar. 3) `npm run auth:admin -- create-admin --email <correo de un admin actual>`: esa misma cuenta pasa a ser admin local, con su historial. 4) Ese admin entra, asigna contraseñas desde el panel (filtro "sin contraseña") y las reparte. | Todas conservan su historial, nombre, foto y username, y entran con su correo o su username en cuanto tienen contraseña. Los roles del proveedor externo dejan de valer: los admins se marcan de nuevo en el panel. Entre los pasos 2 y 4 solo puede entrar el admin: conviene avisar antes y hacerlo fuera de horario. |
| `local` → `externo` | 1) Backup. 2) Recomendado: desde el panel, alinear el correo de cada cuenta con el que tiene en el proveedor externo. 3) En el `.env`, agregar las las variables del proveedor; reiniciar. 4) Cada persona entra con el proveedor externo. | Las cuentas cuyo correo coincide con el proveedor externo conservan su historial; si no coincide, el proveedor externo crea una cuenta nueva sin ese historial (de ahí el paso 2). Los roles pasan a venir del proveedor externo. Las credenciales locales quedan inactivas y sirven para volver atrás. Si no se van a necesitar, se pueden borrar con `DELETE FROM local_credentials;` después del backup. |

Volver atrás es el mismo procedimiento en sentido contrario. Si se vuelve a `local` sin haber borrado
las credenciales, las contraseñas locales viejas vuelven a valer: si pasó mucho tiempo, conviene
restablecerlas.

---

## 11. Decisiones confirmadas

Todas el 2026-10-05:

1. El proveedor externo es opcional y se define en el `.env`: si no está configurado, se usan cuentas locales (D1).
2. **Sin modo híbrido.** Se evaluó el proveedor externo y cuentas locales a la vez, y se descartó: requería demasiados
   cambios (proveedor por cuenta, validación cruzada contra el proveedor externo, cuenta de servicio, conversión
   cuenta por cuenta) para un uso poco probable.
3. Las cuentas locales entran con correo o con un username opcional (D11).
4. El proveedor externo acepta el correo en el mismo campo que el usuario, así que el formulario de login es el mismo
   en los dos modos (D11).
5. Un admin puede desactivar cualquier cuenta, en los dos modos (D19).
6. Cambiar de modo conserva el historial de los usuarios (D20, §10).
7. La duración de sesión y la política de contraseñas las administra un admin desde el panel, no el
   `.env` (§4.4). Incluye vencimiento, historial y bloqueo por intentos, apagados por defecto.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper el modo `externo`, que hoy funciona | Las fases 1 a 4 no lo cambian; invariante 14 con test; los tests de auth existentes conservan sus expectativas. |
| Migración de base en producción | Cambio aditivo (§5) y backup antes. |
| Memoria de scrypt contra el límite de PM2 | Parámetros fijos (D4), fuera del panel, siempre async. |
| Usar el bloqueo por intentos para bloquear a alguien a propósito | Apagado por defecto, desbloqueo de admin, misma respuesta que el rate limit (D17). |
| Un admin endurece la política sin medir el efecto | El panel advierte antes de guardar, y se aplica en el próximo login sin cortar sesiones (D16). |
| Migración al proveedor externo con correos que no coinciden | Alinear los correos desde el panel antes de cambiar de modo (§10, paso 2). |
| Migración a local: nadie entra hasta tener contraseña | Avisar antes, hacerlo fuera de horario, y usar el filtro "sin contraseña" del panel (§10). |
| Costo de verificar el historial de contraseñas | Máximo 12 contraseñas (D15), siempre async. |

---

## 13. Fuera de alcance (decidido, no olvidado)

- **Modo híbrido** (El proveedor externo y cuentas locales a la vez): descartado (§11).
- **Cuenta de servicio del proveedor externo:** el proveedor externo puede darla, pero este plan no la necesita. Podría servir más
  adelante para sincronizar el directorio desde el server en vez de con el token de cada usuario.
- **Recuperación de contraseña y avisos por email** (vencimiento, restablecimiento): el proyecto no
  tiene SMTP. El camino es el restablecimiento de un admin o el CLI.
- **MFA / TOTP.**
- **Refresh tokens o sesiones del lado del server:** igual que hoy con el proveedor externo, cuando vence el token se
  vuelve a iniciar sesión.
- **Política de contraseñas en modo `externo`:** la define el proveedor externo.
- **Exponer en el panel** los parámetros de scrypt, el largo máximo o los rate limits globales (D4, D17).
- **Que cada persona cambie su propio username o email:** lo hace un admin.
- **Otros proveedores (OIDC, LDAP):** el diseño los admitiría como un modo más deducido del `.env`,
  pero no se implementan acá.
