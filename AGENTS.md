# chat-interno — instrucciones para agentes de IA

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
que ya existe están en **[TESTING_PLAN.md](TESTING_PLAN.md)**. Si vas a tocar
`backend/` o `frontend/`, leelo antes de escribir el test — ahí está el criterio de
mocking de cada capa (Prisma, EXTERNAL_AUTH, socket.io, etc.) para no reinventarlo por archivo.

## Cómo correr los tests

```bash
npm run test --workspace=backend
npm run test --workspace=frontend
```

O ambos desde la raíz: `npm test`.

> Estos comandos existen recién después de ejecutar la Fase 0 de
> [TESTING_PLAN.md](TESTING_PLAN.md). Si `npm test` todavía no existe en este repo,
> esa es la primera tarea: [testing-plan/00-infrastructure-setup.md](testing-plan/00-infrastructure-setup.md).

## Otras convenciones del repo

- `frontend/` corre sobre una versión de Next.js muy reciente con cambios que rompen
  respecto a lo habitual — ver [frontend/AGENTS.md](frontend/AGENTS.md) antes de
  escribir código de UI nuevo.
- Los comentarios en el código (backend y frontend) están en español y suelen explicar
  el *por qué* de una decisión no obvia (ver `backend/API.md` y los `README.md` de
  cada módulo bajo `backend/src/modules/`). Leerlos antes de asumir comportamiento.
