# Proveedores de autenticación

LINK trae cuentas propias (usuario y contraseña guardados en su base). Si tu organización ya tiene un
sistema donde viven las cuentas —un directorio, un servicio de identidad propio— podés conectarlo con un
**proveedor de autenticación**: un módulo que LINK carga al arrancar y que solo se ocupa de validar las
credenciales. Este documento explica cómo escribir uno, cómo instalarlo y cómo se mantiene compatible
cuando actualizás LINK.

> Una instalación usa **un** modo: cuentas locales (sin proveedor) o un proveedor externo. Convivir los
> dos y los inicios de sesión por redirección (OIDC, SAML) no están soportados todavía.

## Cómo funciona

```
POST /auth/login ─► LINK ──► provider.authenticate(credenciales) ──► tu sistema
                     │                    │
                     │   identidad externa ◄
                     ▼
              guarda la cuenta · rechaza las desactivadas · filtra los roles
                     │
                     ├─► emite la sesión de LINK (su propio token)
                     └─► provider.onLogin(...) en segundo plano (avatar, directorio)
```

El proveedor interviene **solo al iniciar sesión**. Después, cada request, cada socket y cada descarga se
verifican con la sesión de LINK, sin volver al proveedor. Por eso LINK se ocupa de todo lo demás, igual
para cualquier proveedor: la duración de la sesión, la revocación, los roles, la desactivación de cuentas
por un admin y la auditoría.

Qué hace LINK con lo que devuelve el proveedor:

- **Reconoce a la persona** por `externalId` y, si no la encuentra, por correo (sin distinguir
  mayúsculas). Una cuenta que ya existía conserva su historial.
- **Guarda los roles** que informa el proveedor, en cada inicio de sesión, pero se queda solo con los que
  LINK conoce (hoy, `admin`). Cambiar un rol en tu sistema se aplica en el siguiente inicio de sesión.
- **Respeta una cuenta desactivada** en LINK aunque el proveedor acepte la contraseña.
- **Mantiene el nombre y la foto** que la persona editó en LINK: el proveedor no los pisa.

## La interfaz

Está en [`backend/src/auth-providers/api.ts`](../backend/src/auth-providers/api.ts), un archivo sin
imports que se copia tal cual a tu repositorio. Lo que tenés que implementar:

```ts
export interface AuthProvider {
  id: string;            // estable: se guarda en User.identityProvider y en la auditoría
  displayName: string;   // "Sincronizado con {displayName}" en la interfaz
  apiVersion: number;    // AUTH_PROVIDER_API_VERSION
  init?(ctx): Promise<void> | void;
  authenticate(input, ctx): Promise<AuthenticateResult>;
  onLogin?(event, ctx): Promise<void>;
}
```

| Miembro | Cuándo corre | Qué hace |
|---|---|---|
| `init` | Al arrancar el backend | Lee y valida **tu** configuración (variables de entorno, URLs, secretos). Si lanza, el backend no arranca y el mensaje se muestra. |
| `authenticate` | En cada intento de inicio de sesión | Valida usuario y contraseña y devuelve la identidad. Tiene un tope de 10 s: ponele uno propio más corto a tus llamadas. |
| `onLogin` | Después de crear la sesión, en segundo plano | Sincroniza avatar o directorio con credenciales que solo existen en ese momento (por ejemplo, el token de tu sistema, que le pasaste en `providerData`). Un error se loguea y no afecta al inicio de sesión. |

### `authenticate`

Recibe `{ login, password, clientIp }` (`login` es lo que escribió la persona: usuario o correo;
`clientIp` ya está resuelta según `TRUST_PROXY`, por si tu sistema aplica bloqueos por IP) y devuelve:

```ts
{
  externalId: string;          // único en toda la instalación
  email: string;
  username?: string | null;
  fullName: string;
  roles: string[];             // todos los que tenga; LINK filtra
  providerData?: unknown;      // lo que quieras pasarle a onLogin; LINK no lo mira
}
```

Los errores esperados son `AuthProviderError(reason)`:

| `reason` | Cuándo | Respuesta de LINK | Auditoría (`LOGIN_FAILED`) |
|---|---|---|---|
| `invalid_credentials` | Usuario o contraseña incorrectos | `401` | `invalid_credentials` |
| `access_denied` | Tu sistema rechaza a la persona (por ejemplo, sin acceso a esta aplicación) | `403` | `forbidden_by_provider` |
| `provider_unavailable` | Tu sistema no responde (caído, timeout) | `503` | `provider_unreachable` |
| `provider_error` | Respondió algo inesperado | `503` | `provider_error` |

El texto que ve la persona es siempre el de LINK: el mensaje del error es para el log de diagnóstico. Cualquier
otro error se trata como `provider_error`. Si tu sistema no distingue "contraseña incorrecta" de "sin
acceso", informá `access_denied` o `invalid_credentials` según lo que sepas, sin inventar una conclusión.

### El contexto

Es lo único de LINK que ve tu proveedor:

| | |
|---|---|
| `ctx.logger` | `debug`, `info`, `warn` y `error`. **Nunca** pasarle contraseñas ni tokens. |
| `ctx.users.upsertExternalUser(user)` | Crea o actualiza a una persona del directorio, con las reglas de LINK. No toca su estado ni sus roles. |
| `ctx.users.setAvatarFromProvider(userId, image \| null)` | Guarda el avatar si cambió, salvo que la persona haya editado el suyo en LINK. `null` lo quita. |
| `ctx.users.listWithoutAvatar()` | Las personas de tu proveedor que todavía no tienen avatar, para no pedirle todas las fotos a tu sistema. |

## Escribir un proveedor

Un proveedor mínimo, en TypeScript. El ejemplo completo y probado está en
[`backend/src/auth-providers/example/`](../backend/src/auth-providers/example/index.ts).

```ts
import { AUTH_PROVIDER_API_VERSION, AuthProvider, AuthProviderError } from "./api";

export function createAuthProvider(): AuthProvider {
  let baseUrl: string;

  return {
    id: "mi-sistema",
    displayName: "Mi Sistema",
    apiVersion: AUTH_PROVIDER_API_VERSION,

    init() {
      const url = process.env.MI_SISTEMA_URL;
      if (!url) throw new Error("MI_SISTEMA_URL is required");
      baseUrl = url;
    },

    async authenticate({ login, password, clientIp }, ctx) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password, ip: clientIp }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new AuthProviderError("provider_unavailable");
      }
      if (response.status === 401) throw new AuthProviderError("invalid_credentials");
      if (!response.ok) throw new AuthProviderError("provider_error", `status ${response.status}`);

      const person = await response.json();
      return {
        externalId: person.id,
        email: person.email,
        username: person.username,
        fullName: person.name,
        roles: person.roles,
      };
    },
  };
}
```

Recomendaciones:

- **Cada variable propia se lee en `init`**, no al importar el módulo: así un valor faltante falla al
  arrancar, con un mensaje claro, y no en el primer inicio de sesión.
- **Un `id` estable.** Cambiarlo desvincula a las personas ya sincronizadas y confunde la auditoría. Solo
  letras minúsculas, números, `-` y `_`; `local` está reservado.
- **No guardes estado que no puedas perder.** El backend corre como una sola instancia y reinicia: un
  throttle en memoria (por ejemplo, sincronizar el directorio a lo sumo cada 10 minutos) está bien.
- **Privacidad.** No loguees contraseñas, tokens ni respuestas completas de tu sistema; los identificadores
  de personas, mejor que los correos.

## Instalar un proveedor

Variables de LINK:

| Variable | Descripción |
|---|---|
| `AUTH_PROVIDER_MODULE` | Ruta **absoluta** a un archivo JavaScript (CommonJS) o nombre de un paquete que se resuelva desde `backend/`. Sin definir, son cuentas locales. |
| `SESSION_JWT_SECRET` | Obligatoria con cualquier proveedor: firma las sesiones de LINK. |

Las variables del proveedor (`MI_SISTEMA_URL` en el ejemplo) las define y valida el propio proveedor.

Al arrancar, antes de escuchar, LINK carga el módulo, lo valida y llama a `init`. Si algo falla, no
arranca y dice por qué:

| Mensaje | Causa |
|---|---|
| `AUTH_PROVIDER_MODULE "…" could not be loaded: …` | La ruta no existe, el archivo tiene un error o le falta una dependencia |
| `… is neither an absolute path nor a package name` | Se usó una ruta relativa |
| `… does not export an auth provider` | El módulo no exporta `createAuthProvider(ctx)` ni un objeto con `authenticate()` |
| `… is not a valid auth provider: …` | Falta `id` o `displayName`, el `id` no es válido, o falta una operación |
| `… implements auth provider API version N but this LINK supports version M` | El plugin se construyó para otra versión de la interfaz |
| `The "…" auth provider could not start: …` | `init` lanzó (por ejemplo, una variable propia faltante) |

El módulo corre dentro del proceso del backend, con sus mismos permisos: es código de quien administra la
instalación, igual que el `.env`. Instalá solo proveedores en los que confíes.

### Empaquetarlo en un solo archivo

Para no depender de qué hay en `node_modules` del servidor, empaquetá el proveedor con sus dependencias en un
único archivo CommonJS:

```bash
npx esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/provider.cjs
```

`src/index.ts` exporta `createAuthProvider`. Tu repositorio tiene su **propia copia** de `api.ts` (copiala
tal cual cada vez que actualices LINK; no importa nada).

### Con Docker

Una imagen derivada de la del backend, sin tocar el código de LINK:

```dockerfile
ARG LINK_VERSION
FROM link-backend:${LINK_VERSION}
COPY dist/provider.cjs /opt/link-plugins/provider.cjs
ENV AUTH_PROVIDER_MODULE=/opt/link-plugins/provider.cjs
```

### Sin Docker

Un checkout de LINK en un tag, el archivo del proveedor en una ruta fuera del checkout (por ejemplo
`/opt/link-plugins/`) y `AUTH_PROVIDER_MODULE` en `backend/.env`.

En los dos casos, **actualizar LINK** es cambiar de versión, reconstruir y correr los tests del proveedor.
No hace falta fusionar nada.

## Probarlo

El proveedor de ejemplo se carga en los tests de LINK con el loader real y se ejercita a través de la
orquestación real del inicio de sesión
([`example.test.ts`](../backend/src/auth-providers/example/example.test.ts)). Podés seguir el mismo patrón en
tu repositorio:

1. Cargá tu módulo con la misma lógica que el loader (o corré el backend con `AUTH_PROVIDER_MODULE`
   apuntando a él).
2. Probá `authenticate` con cada `reason`: credenciales incorrectas, rechazo, sistema caído, respuesta
   inesperada.
3. Probá que `init` falle con un mensaje claro cuando falta una variable.
4. Probá que ningún log contiene la contraseña ni un token.

## Compatibilidad entre versiones

La interfaz tiene un número de versión, `AUTH_PROVIDER_API_VERSION`, y el plugin declara con cuál se
construyó (`apiVersion`).

- **Agregar** algo opcional —un campo, una operación nueva en `ProviderContext`— **no** cambia la versión: un
  plugin existente sigue funcionando.
- **Quitar o cambiar** algo sí la cambia, y es un cambio **MAJOR** de LINK (ver
  [VERSIONING.md](../VERSIONING.md)) que se anuncia en una sección "Plugins" del
  [CHANGELOG](../CHANGELOG.md).
- Si el plugin declara otra versión, el backend **no arranca** y lo dice: nunca falla en silencio.

## Licencia

LINK es software libre bajo la AGPL-3.0 (ver [LICENSE](../LICENSE)). Un proveedor cargado en el mismo
proceso probablemente forma, junto con LINK, una obra combinada, y la AGPL pide ofrecer su código fuente a
quienes usan esa obra por la red (§13). No es asesoramiento legal: si vas a distribuir un proveedor
propietario, consultalo.
