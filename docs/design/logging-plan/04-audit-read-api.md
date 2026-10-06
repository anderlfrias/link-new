# Fase 4 — Lectura del audit trail (API + panel de admin)

**Prerrequisitos:** Fase 3 cerrada (el módulo `audit/` existe y las filas tienen contexto).
**Deja andando:** `GET /v1/admin/audit-logs` con filtros y paginación, y una sección nueva en el
panel de admin que la consume.
**Por qué importa:** un audit trail que solo se puede consultar entrando a Postgres a mano no
cumple su función — el que necesita auditar (un admin, seguridad, RRHH) no tiene acceso a la base.

---

## 4.0 ⚠️ Una decisión de producto que hay que tomar antes de escribir código

Las acciones a nivel mensaje (`SEND_MESSAGE`, `FORWARD_MESSAGE`, `EDIT_MESSAGE`,
`DELETE_MESSAGE`) **ya se auditan hoy** — eso no lo introduce este plan. Pero hasta ahora esas
filas eran inaccesibles en la práctica. Exponerlas en un panel convierte el audit trail en algo
cualitativamente distinto: una vista de **quién le escribe a quién y cuándo**, consultable por
cualquier admin.

No hay contenido de mensajes ahí (§4 de LOGGING_PLAN lo prohíbe y el contrato de `metadata` de la
Fase 3 lo hace cumplir por tipos), pero los metadatos de comunicación de empleados son sensibles
por sí mismos, y en varias jurisdicciones están regulados aparte del contenido.

**Default que implementa esta fase, elegido por prudencia:** el panel arranca mostrando solo las
acciones de **administración y autenticación** (`LOGIN`, `LOGIN_FAILED`, `UPDATE_SETTINGS`,
`ADMIN_DELETE_FILE`). Las acciones de chat existen en la API y se pueden pedir, pero hay que
seleccionarlas explícitamente en el filtro — no aparecen por omisión.

Si el negocio quiere otra cosa (mostrar todo por defecto, o directamente no exponer las acciones de
chat en la API), **es una decisión de quien es dueño del producto, no del agente que implementa.**
Preguntá antes de cambiar este default, y si lo cambiás, dejá anotado quién lo decidió en
- [x] Default implementado como está descrito, **o** cambiado con una decisión registrada en el README

---

## 4.1 Backend — el endpoint

Módulo `backend/src/modules/audit/`, completando lo que la Fase 3 dejó (faltan validator, service
de lectura, controller y route).

### Contrato

`GET /v1/admin/audit-logs` — requiere `authenticate` + `attachInternalUser` + `requireRoles(ADMIN_ROLE)`.

Paginación **por cursor**, igual que `/v1/admin/files` (ver `file.controller.ts#listAdmin`): no
inventes un esquema nuevo de `page`/`pageSize`.

| Query param | Tipo | Notas |
|---|---|---|
| `before` | string (uuid) | id de la última fila de la página anterior |
| `limit` | number | default 50, máximo 200 |
| `action` | string \| string[] | uno o varios valores de `AuditAction` |
| `userId` | string (uuid) | actor |
| `targetType` | string | `AppSettings`, `StoredFile`, … |
| `from` / `to` | ISO date | rango sobre `createdAt` |

Respuesta:

```ts
{
  items: Array<{
    id: string;
    action: AuditAction;
    createdAt: string;
    actor: { id: string | null; email: string | null; name: string | null };
    conversationId: string | null;
    /// Solo para conversaciones GROUP — ver la nota de privacidad abajo.
    conversationName: string | null;
    messageId: string | null;
    targetType: string | null;
    targetId: string | null;
    metadata: unknown;
    ip: string | null;
    userAgent: string | null;
    requestId: string | null;
  }>;
  nextCursor: string | null;
}
```

> **Nota de privacidad sobre `conversationName`:** se devuelve **solo si la conversación es
> `GROUP`**. El "nombre" de una `PRIVATE` es la otra persona, y resolverlo convertiría cada fila en
> "X le escribió a Y" en texto plano, legible de un pantallazo. Para una `PRIVATE` o `SELF` va
> `null`: el `conversationId` sigue ahí para quien tenga una razón formal para investigarlo.
> Implementalo en la query de Prisma (`select` condicional por `type`), no filtrando en el
> frontend.

### Archivos

- `audit.types.ts` — agregar `AuditLogFilters`, `AuditLogListItem`, `AuditLogListResponse`
- `audit.validator.ts` — schema de yup para la query (`validateQuery` si existe en
  `validate.middleware.ts`; si solo hay `validateBody`, parseá en el controller como hace
  `file.controller.ts#listAdmin`, no agregues un middleware nuevo solo para esto)
- `audit.repository.ts` — `listForAdmin(filters, { beforeId, limit })`. Un único punto que arma el
  `where`, siguiendo el criterio ya documentado en `file.repository.ts#buildAdminFileWhere`
- `audit.service.ts` — `listAuditLogs`: aplica el default de acciones de §4.0 cuando no viene
  filtro `action`, y mapea a `AuditLogListItem`
- `audit.controller.ts` — `listAdmin`
- `audit.route.ts` — `adminAuditRouter`, con el `router.use(authenticate, attachInternalUser, requireRoles(ADMIN_ROLE))` al tope, igual que `adminFileRouter`
- `route.ts` — montar `router.use("/v1/admin/audit-logs", adminAuditRouter)`

- [x] Los 6 archivos del módulo creados/extendidos
- [x] Ruta montada en `route.ts` junto a las otras de `/v1/admin/*`
- [x] `limit` topeado a 200 en el servidor (no confiar en el cliente)
- [x] `requireRoles(ADMIN_ROLE)` aplicado a nivel router
- [x] `conversationName` solo para GROUP

### Tests obligatorios

`audit.repository.test.ts`:
- [x] Sin filtros → `where` vacío, orden `createdAt desc`, `take` = limit
- [x] Con `action` simple y con array → `in` bien armado
- [x] Con `from`/`to` → rango sobre `createdAt`
- [x] Con `before` → paginación por cursor aplicada

`audit.service.test.ts`:
- [x] **Sin filtro `action`, aplica el default de §4.0** (solo admin+auth) — el test que protege la
      decisión de privacidad
- [x] Con `action` explícito incluyendo acciones de chat, las devuelve
- [x] `limit` mayor a 200 se topea a 200
- [x] `nextCursor` es el id de la última fila cuando hay más, y `null` cuando no
- [x] `conversationName` es `null` para una conversación PRIVATE y trae el nombre para una GROUP

`audit.route.test.ts` (con supertest, patrón de `file.route.test.ts`):
- [x] Sin token → 401
- [x] Con token sin rol admin → 403
- [x] Con admin → 200 y el shape de respuesta esperado

---

## 4.2 Frontend — la sección del panel

La estructura del panel de admin ya está establecida y su propio comentario dice cómo extenderla
(ver `features/admin/constants/admin-nav.constant.ts`): **un objeto más en el nav + una `page.tsx`**.
El shell y el gate de rol ya cubren cualquier ruta nueva.

Espejá exactamente los archivos de `admin-files` (es el más parecido: listado con filtros y
paginación por cursor):

| Archivo nuevo | Espejo de |
|---|---|
| `features/admin/types/admin-audit.types.ts` | `admin-files.types.ts` |
| `features/admin/api/admin-audit.api.ts` | `admin-files.api.ts` |
| `features/admin/hooks/use-admin-audit-logs.ts` | `use-admin-files.ts` |
| `features/admin/components/AdminAuditPanel.tsx` | `AdminFilesPanel.tsx` |
| `features/admin/components/AdminAuditRow.tsx` | `AdminFileRow.tsx` |
| `app/(admin)/admin/audit/page.tsx` | `app/(admin)/admin/files/page.tsx` |

Más la entrada de nav:

```ts
  { href: "/admin/audit", label: "Auditoría", icon: IconHistory },
```

Antes de escribir componentes, leé [frontend/AGENTS.md](../../../frontend/AGENTS.md): esta versión de
Next.js tiene cambios que rompen respecto de lo habitual.

Requisitos de la UI:
- Filtros por acción (multi-select), por rango de fechas y por actor.
- La lista arranca con el default de §4.0. Que el usuario **vea** que hay un filtro aplicado por
  omisión: un filtro invisible es peor que no tenerlo, porque parece que no hay más datos.
- Cada fila: fecha/hora, actor (nombre + email), acción en castellano, recurso afectado, IP.
- El `metadata` en un detalle expandible, no en la fila (el diff de `UPDATE_SETTINGS` puede tener
  muchos campos).
- Traducir los nombres de acción a castellano en un `constants/audit-action-labels.constant.ts`
  (sigue el patrón de `group-permission-options.constant.ts`). Nunca mostrar `ADMIN_DELETE_FILE`
  crudo a un auditor.

- [x] Los 6 archivos creados
- [x] Entrada de nav agregada
- [x] El filtro por omisión es visible en la UI
- [x] Etiquetas de acción en castellano
- [x] `metadata` en un detalle expandible

### Tests obligatorios (uno por archivo, convención del repo — cada archivo de `features/admin` tiene su `.test`)

- [x] `admin-audit.api.test.ts`: arma la URL con todos los query params y omite los `undefined`
- [x] `use-admin-audit-logs.test.ts`: estado inicial, carga, error, y paginación (pide la página
      siguiente con el `nextCursor` recibido)
- [x] `AdminAuditPanel.test.tsx`: renderiza filas, muestra el filtro por omisión, dispara la
      recarga al cambiar un filtro, y muestra el estado vacío
- [x] `AdminAuditRow.test.tsx`: muestra la etiqueta en castellano de la acción y expande el `metadata`

---

## 4.3 Opcional (no bloquea la fase)

- Exportar el resultado filtrado a CSV. Es lo primero que pide un auditor que quiere adjuntar
  evidencia a un informe. Si lo hacés: el export tiene que respetar **los mismos filtros y las
  mismas reglas de privacidad** que la vista (incluido el `conversationName` solo-GROUP), y el
  archivo se genera en el cliente a partir de lo ya cargado, no con un endpoint nuevo sin límite.

---

## 4.4 Verificación de la fase

```bash
npm test
```

```bash
npm run build
```

- [x] Tests de ambos workspaces en verde
- [x] Con un usuario **sin** rol admin, `/admin/audit` no es accesible (el gate del shell ya
      existente lo cubre — verificalo, no lo asumas)
- [x] El listado pagina de verdad con más de 50 filas
- [x] Una conversación PRIVATE no muestra nombre en ninguna fila

Commits sugeridos:
`feat(backend): endpoint de lectura del audit trail para admin`
`feat(frontend): panel de auditoria en el admin`

Al cerrar: marcar la Fase 4 ✅ en [LOGGING_PLAN.md](../LOGGING_PLAN.md) §5 y correr
`/graphify . --update`.
