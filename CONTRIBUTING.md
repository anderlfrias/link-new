# Cómo contribuir a LINK

Gracias por el interés. Esta guía resume cómo preparar el entorno y las reglas que el proyecto
aplica a todo cambio. Las mismas reglas, en formato para agentes de IA, están en
[AGENTS.md](AGENTS.md).

## Preparar el entorno

Seguir [Desarrollo local](README.md#desarrollo-local-sin-docker) en el README: Node.js 24
(`.nvmrc`), `npm ci`, un PostgreSQL, los `.env` a partir de los `.env.example`, y
`npm run db:migrate`.

## Flujo de trabajo

1. Crear una rama desde `main` para el cambio.
2. Hacer el cambio con sus tests (ver abajo) y verificar localmente:

   ```bash
   npm test
   npm run build
   ```

3. Agregar una entrada en la sección `[Unreleased]` de [CHANGELOG.md](CHANGELOG.md) si el cambio
   es visible para quien usa o instala LINK (ver [VERSIONING.md](VERSIONING.md)).
4. Abrir un pull request. La CI corre tests, builds, la verificación de migraciones y el build de
   las imágenes Docker, y tiene que pasar entera.

Para cambios grandes, conviene abrir antes un issue para acordar el enfoque.

## Reglas del proyecto

### Tests obligatorios

Todo cambio que agregue o modifique comportamiento en `backend/src/**` o `frontend/src/**`
incluye al menos un test unitario que cubra el caso principal y los casos de error razonables.
Esto aplica también a los fixes: un fix sin test de regresión no evita que el bug vuelva.

Las únicas excepciones son los cambios puramente de configuración o infraestructura sin lógica,
y los cambios de estilo (formato, orden de imports).

- Runner: [Vitest](https://vitest.dev) en los dos workspaces. Los tests van junto al archivo que
  prueban (`foo.ts` → `foo.test.ts`).
- Backend: en los tests de *services* se mockea el módulo repositorio, no Prisma. Las llamadas
  externas (`fetch`, Socket.IO, `web-push`) también se mockean.
- Frontend: Testing Library, con `apiRequest` y el cliente de socket mockeados.
- El criterio completo de mocking por capa está en
  [docs/design/TESTING_PLAN.md](docs/design/TESTING_PLAN.md).

### Logging, auditoría y privacidad (backend)

- Nada de `console.*` en `backend/src`: se usa el logger de `src/config/logger.ts` (pino). Un test
  lo hace cumplir.
- Los logs de aplicación y el registro de auditoría (`AuditLog`) son cosas distintas y no se
  reemplazan entre sí. Para agregar una acción auditable, ver
  [backend/src/modules/audit/README.md](backend/src/modules/audit/README.md).
- Reglas de privacidad, no negociables:
  - Nunca loguear el contenido de un mensaje.
  - Nunca loguear credenciales ni tokens.
  - Nunca loguear un body de request completo.
  - En los logs, identificar al usuario por su UUID interno, no por email ni nombre.
  - De los archivos subidos, registrar solo `fileId`, tipo MIME y tamaño, nunca el nombre original.
  - La `metadata` de auditoría tiene un esquema cerrado.
- El detalle y el porqué de cada regla está en
  [docs/design/LOGGING_PLAN.md](docs/design/LOGGING_PLAN.md) §3 y §4.

### Base de datos

Los cambios en `backend/prisma/schema.prisma` van siempre con su migración:

```bash
npm run db:migrate:dev -- --name descripcion-del-cambio
```

La CI aplica las migraciones sobre una base vacía y falla si no coinciden con el schema.

### Convenciones de código

- Identificadores en inglés. Comentarios y documentación en español, explicando el *por qué* de
  las decisiones no obvias.
- Antes de cambiar un comportamiento, leer los comentarios y el `README.md` del módulo: suelen
  explicar restricciones que no se ven en el código.
- `frontend/` usa una versión reciente de Next.js con cambios incompatibles respecto de versiones
  anteriores: consultar la documentación incluida en `node_modules/next/dist/docs/` (ver
  [frontend/AGENTS.md](frontend/AGENTS.md)).
- No commitear secretos, archivos `.env`, datos personales ni URLs o IPs de infraestructura real.
  En tests y ejemplos, usar dominios reservados como `example.com`.

## Licencia de las contribuciones

LINK se distribuye bajo la [AGPL-3.0-only](LICENSE). Abrir un pull request implica aceptar que la
contribución se publique bajo esa misma licencia.

## Reportar problemas

- Bugs y propuestas: abrir un issue con la plantilla correspondiente.
- Vulnerabilidades: **no** abrir un issue público, ver [SECURITY.md](SECURITY.md).
