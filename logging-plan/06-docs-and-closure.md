# Fase 6 — Documentación y cierre

**Prerrequisitos:** Fases 0 a 5 cerradas.
**Deja andando:** que el próximo agente (o la próxima persona) no tenga que leer este plan para
entender cómo se loguea y cómo se audita en este repo. Un plan de implementación es un andamio: la
documentación permanente vive en el código y en los READMEs.

---

## 6.1 `backend/API.md` — documentar el endpoint nuevo

Agregar `GET /v1/admin/audit-logs` siguiendo el formato de las otras entradas del archivo (que ya
documentan los endpoints de `/v1/admin/*`): query params, shape de respuesta, códigos de error, y
**la nota de privacidad de `conversationName`** (solo-GROUP, ver Fase 4 §4.1). Esa nota es parte
del contrato, no un detalle de implementación: un cliente que asuma que siempre viene el nombre
está asumiendo mal.

Documentar también el header de respuesta `x-request-id` que ahora devuelve **toda** la API
(Fase 0), y para qué sirve: es el dato que un usuario puede citar al reportar un error.

- [ ] `GET /v1/admin/audit-logs` documentado
- [ ] Nota de privacidad de `conversationName` incluida
- [ ] `x-request-id` documentado como header de respuesta general

> ⚠️ **Cuidado al correr graphify después de editar `API.md`.** Es un documento compartido por
> muchos temas: al re-extraer, hay que pasarle la lista **completa** de nodos existentes del
> archivo, no solo los relevantes al cambio — si no, los nodos de los otros endpoints se borran en
> silencio del grafo.

---

## 6.2 READMEs de módulo

El repo documenta cada módulo en su propio `README.md` y esa es la convención que hay que respetar
(ver `backend/src/modules/*/README.md` y `backend/src/socket/README.md`).

- [ ] **`backend/src/modules/audit/README.md`** (creado en la Fase 3) completo y al día: la tabla
      de acciones con el `metadata` de cada una, la distinción log-de-aplicación vs audit-trail, el
      por qué del `@@map("chat_audit_logs")` histórico, y las **tres** cosas que hay que tocar para
      agregar una acción nueva (enum, `AuditMetadataMap`, tabla del README)
- [ ] **`backend/src/socket/README.md`**: su comentario de la cadena de middlewares numerada ahora
      incluye el de contexto/logging como hecho, no como pendiente
- [ ] **`backend/src/modules/settings/README.md`**: `auditLogRetentionDays` documentado junto a los
      otros campos de retención, con la advertencia de que el borrado es irreversible
- [ ] **`backend/src/modules/auth/README.md`**: que el login se audita (`LOGIN` / `LOGIN_FAILED`),
      y la nota de que `forbidden_by_provider` **no** equivale a "contraseña incorrecta" — es la
      misma ambigüedad de EXTERNAL_AUTH que ese README ya explica para el mensaje de error al usuario

---

## 6.3 Documentación para operar

- [ ] **`backend/.env.example`** (o `backend/README.md` si no existe): `LOG_LEVEL` y `LOG_PRETTY`
      documentadas, con el valor recomendado para desarrollo (`debug` / `true`) y para producción
      (`info` / `false`)
- [ ] **`ecosystem.config.js`**: el comentario de cabecera menciona `pm2-logrotate` como paso
      necesario del deploy, y por qué `time` difiere entre backend y frontend
- [ ] Un párrafo en `backend/README.md` (o donde viva la doc de operación) que responda las tres
      preguntas que se hace alguien a las 3 de la mañana:
      **¿dónde están los logs?** (`pm2 logs link-backend`),
      **¿cómo filtro?** (`pm2 logs link-backend --raw | jq 'select(.level >= 50)'`),
      **¿cómo encuentro una request puntual?** (por `requestId`, que el usuario ve en el header
      `x-request-id`)

---

## 6.4 `AGENTS.md` — la regla permanente

[AGENTS.md](../AGENTS.md) es lo que todo agente lee primero. Hoy tiene una sección
"Plan activo: logging y auditoría" que describe el estado **previo** al plan (38 `console.*`, la
fuga conocida, el audit a medias). Con el plan terminado eso pasó a ser falso:
**reemplazá esa sección** por la regla permanente. El estilo del archivo es breve y con links, no
exhaustivo:

```markdown
## Regla: nada de `console.*` en el backend

`backend/src/**` loguea a través de `src/config/logger.ts` (pino) y del contexto de
`src/config/request-context.ts` — nunca con `console.*`. Hay un test que lo hace cumplir
(`backend/src/no-console.test.ts`); la única excepción permitida está documentada en
`src/config/env.ts`.

Además: **los logs de aplicación y el audit trail son dos cosas distintas** y no se sustituyen
entre sí. Antes de loguear o auditar algo nuevo, leé [LOGGING_PLAN.md](LOGGING_PLAN.md) §3 y §4
— §4 son las reglas de privacidad (nunca contenido de mensajes, nunca tokens) y no son negociables.
Para agregar una acción al audit trail, ver `backend/src/modules/audit/README.md`.
```

- [ ] La sección "Plan activo: logging y auditoría" de `AGENTS.md` reemplazada por la regla
      permanente (ya no debe describir la fuga de credenciales como algo pendiente)
- [ ] El link a `LOGGING_PLAN.md` desde `AGENTS.md` funciona

---

## 6.5 Cierre del plan

- [ ] Las 7 fases marcadas ✅ con fecha en la tabla de [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5
- [ ] Una nota al final de `LOGGING_PLAN.md` diciendo que el plan está completo y que el documento
      queda como registro de **por qué** se hizo así (las tablas de decisiones de §3.1 son lo único
      que no se puede reconstruir leyendo el código)
- [ ] `npm test` en verde en ambos workspaces
- [ ] `npm run build` en verde
- [ ] `/graphify . --update` corrido con el grafo reflejando el módulo `audit/` y los archivos de
      configuración nuevos

### Verificación final de punta a punta

No cierres el plan sin correr esto de verdad — es la prueba de que las tres cosas 🔴 quedaron
resueltas:

1. **Fuga de tokens:** hacer un login real y confirmar que el log no contiene el JWT.
   ```bash
   pm2 logs link-backend --lines 200 --raw | grep -c "eyJ"
   ```
   Tiene que devolver `0`.
2. **Acciones de admin auditadas:** cambiar un valor en el panel de configuración y confirmar que
   aparece una fila `UPDATE_SETTINGS` con el diff, el actor y la IP en el panel de auditoría.
3. **Login auditado:** entrar con una contraseña incorrecta y confirmar que aparece una fila
   `LOGIN_FAILED` con la identidad intentada y la IP, y **sin** la contraseña en ningún campo.

- [ ] Los tres puntos verificados en un entorno real, no solo en tests

Commit sugerido: `docs: documentar logging y audit trail`
