# LINK — instrucciones para agentes de IA

> Para personas: la guía de contribución está en [CONTRIBUTING.md](CONTRIBUTING.md). Las reglas de
> este archivo aplican igual a cualquier contribución.

## Regla: los tests unitarios son obligatorios para código nuevo

**Vigente desde 2026-09-09, sin excepciones salvo las anotadas abajo.**

Ningún cambio que agregue o modifique comportamiento en `backend/src/**` o
`frontend/src/**` se considera terminado sin al menos un test unitario que cubra su
caso principal y sus casos de error/edge razonables. Aplica tanto a features nuevas
como a fixes de bugs — un fix sin test de regresión no evita que el mismo bug vuelva.

Excepciones válidas (las únicas): cambios puramente de configuración/infraestructura
sin lógica, y cambios de estilo puro (formateo, reordenar imports) que no tocan
comportamiento.

El detalle completo de esta política, las decisiones técnicas (qué runner, cómo se
mockea cada capa, dónde van los tests) y el plan por fases para cubrir todo el código
que ya existe están en **[docs/design/TESTING_PLAN.md](docs/design/TESTING_PLAN.md)**. Si vas a tocar
`backend/` o `frontend/`, leelo antes de escribir el test — ahí está el criterio de
mocking de cada capa (Prisma, proveedores de autenticación, socket.io, etc.) para no reinventarlo por archivo.

## Cómo correr los tests

```bash
npm run test --workspace=backend
npm run test --workspace=frontend
```

O ambos desde la raíz: `npm test`.

## Regla: nada de `console.*` en el backend

`backend/src/**` loguea a través de `src/config/logger.ts` (pino) y del contexto de
`src/config/request-context.ts` — nunca con `console.*`. Hay un test que lo hace cumplir
(`backend/src/no-console.test.ts`); la única excepción permitida está documentada en
`src/config/env.ts`.

Además: **los logs de aplicación y el audit trail son dos cosas distintas** y no se sustituyen
entre sí. Antes de loguear o auditar algo nuevo, leé [docs/design/LOGGING_PLAN.md](docs/design/LOGGING_PLAN.md) §3 y §4
— §4 son las reglas de privacidad (nunca contenido de mensajes, nunca tokens) y no son negociables.
Para agregar una acción al audit trail, ver `backend/src/modules/audit/README.md`.

## Otras convenciones del repo

- `frontend/` corre sobre una versión de Next.js muy reciente con cambios que rompen
  respecto a lo habitual — ver [frontend/AGENTS.md](frontend/AGENTS.md) antes de
  escribir código de UI nuevo.
- Los comentarios en el código (backend y frontend) están en español y suelen explicar
  el *por qué* de una decisión no obvia (ver `backend/API.md` y los `README.md` de
  cada módulo bajo `backend/src/modules/`). Leerlos antes de asumir comportamiento.
- Cuando un comentario cita un documento como `LOGGING_PLAN.md` o `LARGE_FILES_PLAN.md`,
  está en [docs/design/](docs/design/): son los documentos de diseño de cada iniciativa.
- Cambios en `backend/prisma/schema.prisma` van siempre con su migración
  (`npm run db:migrate:dev`); la CI falla si el schema y las migraciones no coinciden.
