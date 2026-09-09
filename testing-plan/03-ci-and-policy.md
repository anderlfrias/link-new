# Fase 16 — CI, piso de cobertura y cierre de política

> Prerequisito: Fases 0–15 cerradas (o al menos las suficientes como para que un
> workflow de CI tenga algo real que correr — no tiene sentido activar esto contra un
> repo con 3 tests). Ver [TESTING_PLAN.md](../TESTING_PLAN.md).

**Nada de esta fase se crea al escribir este plan.** Es la última fase, se ejecuta
cuando el resto ya está en verde. Documentar acá el "cómo" para que quien la ejecute no
tenga que diseñarla desde cero.

## 16.1 — Workflow de GitHub Actions

El repo tiene remoto en GitHub (`Organizacion-Ejemplo/chat-interno`), así que
GitHub Actions es la opción directa, sin infra adicional que levantar. Crear
`.github/workflows/tests.yml`:

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test --workspace=backend -- --coverage
      - run: npm run test --workspace=frontend -- --coverage
```

Notas:
- No hace falta levantar Postgres en el job: todo lo de este plan corre mockeado (ver
  sección 2 de `TESTING_PLAN.md`, "fuera de alcance" incluye integración contra DB
  real). Si en el futuro se agregan tests de integración, ahí sí este workflow
  necesita un servicio de Postgres — no antes.
- `npm ci` en la raíz ya instala ambos workspaces (`backend`/`frontend` están
  declarados en `workspaces` del `package.json` raíz).

## 16.2 — Piso de cobertura (ratchet, no un número fijo de antemano)

No fijar un porcentaje "a ojo" en este documento — depende de lo que realmente haya
quedado cubierto al cerrar las Fases 1–15. Procedimiento:

1. Con todas las fases anteriores cerradas, correr:
   ```bash
   npm run test:coverage --workspace=backend
   npm run test:coverage --workspace=frontend
   ```
2. Tomar el número de `% Lines` (o el que use el reporter de `@vitest/coverage-v8`) de
   cada workspace como piso inicial, redondeando **hacia abajo** unos puntos de
   margen (ej. si da 78%, fijar el piso en 75%).
3. Agregar ese piso en `coverage.thresholds` de cada `vitest.config.ts`:
   ```ts
   coverage: {
     // ...lo que ya existe de la Fase 0...
     thresholds: {
       lines: 75,
       statements: 75,
       functions: 70,
       branches: 65,
     },
   },
   ```
4. El objetivo de este piso es que **nunca baje** — es un ratchet, no una meta a
   alcanzar. Si con el tiempo la cobertura real sube, subir el número acá también (en
   un PR aparte, no mezclado con una feature). Si un PR hace bajar la cobertura por
   debajo del piso, `vitest run --coverage` falla solo (comportamiento nativo de la
   opción `thresholds`), y con eso el job de CI de arriba ya falla sin configuración
   extra.

## 16.3 — Checklist de PR (opcional, recomendado)

Si el repo usa plantilla de PR de GitHub, agregar un ítem en
`.github/pull_request_template.md` (crearlo si no existe):

```markdown
- [ ] Este cambio agrega o modifica comportamiento y tiene su test unitario (ver [AGENTS.md](../AGENTS.md))
```

Esto es un recordatorio visual, no un enforcement — el enforcement real es el piso de
cobertura de CI (16.2) más la revisión humana del PR.

## 16.4 — Sobre automatizar la política más allá de esto

Lo que este plan deja funcionando después de esta fase:
- Regla escrita y siempre cargada como contexto para cualquier agente de IA
  (`AGENTS.md` en la raíz).
- CI que corre los tests existentes y no deja bajar la cobertura por debajo del piso.

Lo que **no** queda resuelto y es una mejora futura explícitamente fuera de este plan
(no inventar que ya está hecho): un check automático que bloquee un PR que toca
`src/**` sin tocar ningún `*.test.*` en el mismo diff. Es técnicamente posible (un
job de CI que compare archivos modificados), pero es más frágil de lo que parece (falsos
positivos en refactors que no cambian comportamiento, config-only changes, etc.) y no
se implementa acá. Si se decide encarar, que sea su propia tarea puntual, no un
sub-ítem de esta fase.

## Definition of Done — Fase 16

- [ ] `.github/workflows/tests.yml` creado y el job pasa en un PR de prueba.
- [ ] Piso de cobertura calculado (no inventado) y seteado en ambos
      `vitest.config.ts`.
- [ ] (Opcional) `.github/pull_request_template.md` con el recordatorio.
- [ ] Fase 16 marcada como hecha en la tabla de `TESTING_PLAN.md` sección 5 — con esto,
      el plan completo queda cerrado.
