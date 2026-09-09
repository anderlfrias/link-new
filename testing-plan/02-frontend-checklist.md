# Checklist — Frontend (Fases 9 a 15)

> Prerequisito: [Fase 0](00-infrastructure-setup.md) cerrada. Protocolo general y
> convenciones en [TESTING_PLAN.md](../TESTING_PLAN.md) — leelo primero si no lo
> hiciste.

**Fuera de alcance en todas las fases de este archivo:** todo lo bajo
`frontend/src/app/**` (`page.tsx`, `layout.tsx`, `manifest.ts`). Son Server
Components/routing de Next.js App Router — no se testean acá, ver sección 2 de
`TESTING_PLAN.md`.

Cómo correr un archivo puntual mientras escribís:

```bash
cd frontend && npx vitest run src/utils/format-date.test.ts
```

Cheatsheet de mocking:

- **Llamadas a la API** (`features/*/api/*.api.ts`, que internamente usan
  `apiRequest` de `lib/api-client.ts`): `vi.mock("@/lib/api-client")` y mockear el
  valor de retorno de `apiRequest` por test.
- **Socket** (`lib/socket-client.ts`): `vi.mock("@/lib/socket-client")`.
- **Hooks que consumen contexto** (auth, tema, settings públicos): envolver el
  `render()` de Testing Library en los providers reales de `frontend/src/providers/`
  con valores de prueba, o crear un helper `renderWithProviders()` reutilizable la
  primera vez que haga falta (Fase 10) y reusarlo después — no reinventarlo por
  feature.
- **Componentes con `next/navigation`** (`useRouter`, `usePathname`, `useParams`):
  `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), ... }))`
  por archivo de test, solo con lo que ese componente puntual usa.
- **Componentes**: priorizar tests de comportamiento observable por el usuario
  (`@testing-library/user-event`: click, type, etc. → efecto esperado) sobre
  snapshots o inspección de props internas.

---

<a id="fase-9"></a>

## Fase 9 — Utils & lib (funciones puras — mayor ROI, empezar por acá)

Todo lo de acá son funciones puras o casi puras. Es la fase con mejor relación
esfuerzo/valor de todo el frontend — sin mocks de React, sin providers, tests
rápidos de escribir. Recomendado como primera fase de frontend.

- [x] `frontend/src/utils/cn.ts` (ya cubierto como smoke test en la Fase 0 — solo
      ampliar casos si hace falta, ej. clases condicionales, merge de conflictos de
      Tailwind vía `tailwind-merge`). (4 tests).
- [x] `frontend/src/utils/compress-image.ts` (5 tests).
- [x] `frontend/src/utils/conversation-display.ts` — `getConversationDisplayName()`/
      `getOtherMembers()`/`getConversationAvatarUrl()`: casos 1-a-1 vs. grupo, chat
      consigo mismo (self chat). (12 tests).
- [x] `frontend/src/utils/dicebear-renderer.ts` (3 tests).
- [x] `frontend/src/utils/download-file.ts` (2 tests).
- [x] `frontend/src/utils/file-format.ts` (6 tests).
- [x] `frontend/src/utils/file-url.ts` (2 tests).
- [x] `frontend/src/utils/format-date.ts` (7 tests).
- [x] `frontend/src/utils/format-duration.ts` (3 tests).
- [x] `frontend/src/utils/group-permissions.ts` — si duplica alguna regla de
      `allowGroupDelete` u otro flag maestro del backend (ver invariante en
      `TESTING_PLAN.md` sección 4), cubrir el mismo caso acá también. (4 tests).
- [x] `frontend/src/utils/message-edit-window.ts` — contraparte frontend de
      `assertWithinTimeLimit()` del backend (Fase 4): mismo criterio de ventana de
      tiempo, casos dentro/fuera de ventana. (3 tests).
- [x] `frontend/src/utils/message-preview.ts` — contraparte frontend de
      `buildLastMessagePreview()` del backend (Fase 3): mensaje borrado → mismo texto
      fijo, sin importar el `content`. (4 tests).
- [x] `frontend/src/utils/message-status.ts` — contraparte frontend de
      `aggregateReceiptStatus()`. (4 tests).
- [x] `frontend/src/utils/mime-type-pattern.ts` — ver nota de sync cliente/servidor en
      Fase 5 del backend y Fase 14 acá: mismos patrones MIME que
      `allowed-file-types.constant.ts` del backend. (3 tests).
- [x] `frontend/src/utils/notification-sound.ts` (2 tests).
- [x] `frontend/src/utils/svg-to-png.ts` (1 test).
- [x] `frontend/src/lib/api-client.ts#apiRequest` — el más importante de esta fase,
      todo el resto del frontend depende de él: query params se serializan
      correctamente y omiten `undefined`; `body` FormData se manda tal cual (sin
      `Content-Type` manual, el browser lo setea); `body` objeto se serializa a JSON
      con `Content-Type: application/json`; header `Authorization: Bearer <token>`
      solo si se pasó `token`; `response.ok === false` → lanza `ApiError` con el
      `error` del body (o `statusText` si no hay body parseable); status 204 →
      devuelve `undefined`; `responseType: "blob"` → devuelve blob en vez de JSON. (8 tests).
- [x] `frontend/src/lib/env.ts` — falta `NEXT_PUBLIC_API_URL` o
      `NEXT_PUBLIC_SOCKET_URL` → throw (para este test puntual hace falta simular
      `process.env` vacío, algo distinto al resto de la fase — puede necesitar
      `vi.resetModules()` + reimport dinámico dentro del test para que el módulo se
      re-evalúe con el env alterado). (3 tests).
- [x] `frontend/src/lib/socket-client.ts` — si expone lógica más allá de instanciar
      `socket.io-client` (ej. reconexión, autenticación del handshake), testear esa
      lógica; si es solo instanciación, opcional. (3 tests).

**Fase 9 cerrada 2026-09-09.** 75 tests nuevos agregados (79/79 tests en verde en
`npm run test --workspace=frontend`, 475/475 tests totales en monorepo), typecheck limpio (`npx tsc --noEmit -p frontend/tsconfig.json`).
Funciones puras de formateo, preview, permisos, imágenes, cliente HTTP y socket client cubiertas rigurosamente.

---

<a id="fase-10"></a>

## Fase 10 — Providers & UI compartida

Acá conviene armar el helper `renderWithProviders()` mencionado en el cheatsheet de
arriba si todavía no existe — varios de estos providers se anidan
(`app-providers.tsx` los combina) y los tests de features de las Fases 11–14 lo van a
reusar.

**Providers** (`frontend/src/providers/`)
- [x] `theme-provider.tsx` — `ThemeProvider`/`useTheme`: toggle entre temas, persiste
      la preferencia (revisar mecanismo: `localStorage`, cookie, etc.). (5 tests).
- [x] `auth-provider.tsx` — `useAuth()` es el nodo más conectado de todo el frontend
      (24 conexiones) — dedicarle tiempo: estado autenticado/no autenticado, login
      exitoso actualiza el estado, logout limpia el estado. (7 tests).
- [x] `public-settings-provider.tsx` — expone `getPublicSettings()` mockeado a través
      del contexto. (4 tests).
- [x] `profile-picture-provider.tsx` (5 tests).
- [x] `socket-provider.tsx` — conecta/desconecta el socket (mockeado, no un socket
      real) según el estado de auth. (2 tests).
- [x] `app-providers.tsx` — smoke test: renderiza sin explotar envolviendo un `children`
      de prueba. (1 test).

**UI compartida** (`frontend/src/components/ui/`)
- [x] `Avatar.tsx` — `hashToIndex()`/paleta de color determinística por usuario. (6 tests).
- [x] `Badge.tsx` (4 tests).
- [x] `Button.tsx` — variantes, estado `disabled` no dispara `onClick`. (5 tests).
- [x] `Checkbox.tsx` (3 tests).
- [x] `Drawer.tsx` — abre/cierra, cierra al click afuera o Escape si lo maneja. (4 tests).
- [x] `Input.tsx` (4 tests).
- [x] `MessageStatusTicks.tsx` — recibe cada `MessageReceiptStatus` y renderiza el
      ícono correspondiente (sent/delivered/read). (5 tests).
- [x] `Modal.tsx` (4 tests).
- [x] `Select.tsx` (3 tests).
- [x] `ThemeToggle.tsx` (3 tests).

**Layout & brand**
- [x] `frontend/src/components/layout/ConversationHeader.tsx` (3 tests).
- [x] `frontend/src/components/layout/DesktopSidebar.tsx` (6 tests).
- [x] `frontend/src/components/layout/EmptyConversationState.tsx` (1 test).
- [x] `frontend/src/components/layout/MobileChatListScreen.tsx` (5 tests).
- [x] `frontend/src/components/layout/UserMenu.tsx` (5 tests).
- [x] `frontend/src/components/brand/Logo.tsx` (2 tests).

**Fase 10 cerrada 2026-09-09.** Helper `renderWithProviders()` y factories de mock creados (`test-utils.tsx`). 87 tests nuevos agregados (166/166 tests en verde en `npm run test --workspace=frontend`, 562/562 tests totales en monorepo), typecheck limpio (`npx tsc --noEmit -p frontend/tsconfig.json`).
Contextos de React (Auth, Theme, Socket, PublicSettings, ProfilePicture), componentes atómicos y layouts de sidebar/header cubiertos rigurosamente.

---

<a id="fase-11"></a>

## Fase 11 — Feature: Auth & Admin

**Auth** (`frontend/src/features/auth/`)
- [x] `api/auth.api.ts` (6 tests).
- [x] `components/LoginForm.tsx` — submit con credenciales llama a la API correcta;
      error de login (403 genérico del backend, ver invariante en `TESTING_PLAN.md`
      sección 4) se muestra al usuario sin distinguir motivo. (5 tests).
- [x] `hooks/use-profile-picture.ts` (1 test).
- [x] `hooks/use-require-role.ts` — contraparte frontend de `requireRoles` del backend
      (Fase 1): usuario sin el rol requerido → comportamiento esperado (redirect,
      render de `ForbiddenScreen`, lo que el hook realmente haga — confirmar leyendo
      el archivo). (4 tests).

**Admin** (`frontend/src/features/admin/`)
- [x] `api/admin-files.api.ts` (2 tests).
- [x] `api/admin-settings.api.ts` (2 tests).
- [x] `api/admin-users.api.ts` (1 test).
- [x] `utils/build-usage-labels.ts` (3 tests).
- [x] `hooks/use-admin-files.ts` (3 tests).
- [x] `hooks/use-admin-settings.ts` (3 tests).
- [x] `hooks/use-admin-users.ts` (3 tests).
- [x] `hooks/use-delete-admin-file.ts` (3 tests).
- [x] `hooks/use-update-admin-settings.ts` (3 tests).
- [x] `components/AdminShell.tsx` (1 test).
- [x] `components/AdminSettingsPanel.tsx` — el flag `allowGroupDelete` y demás
      overrides de grupo (ver invariante en `TESTING_PLAN.md` sección 4): el panel no
      debe permitir un estado de UI que sugiera que hay excepciones para admin de app. (4 tests).
- [x] `components/AdminFilesPanel.tsx` (1 test).
- [x] `components/AdminFileRow.tsx` (3 tests).
- [x] `components/DeleteFileConfirmModal.tsx` (3 tests).
- [x] `components/FileTypeMultiSelect.tsx` — ver nota de sync cliente/servidor
      (Fase 9 y Fase 5 backend): el patrón ingresado manualmente se valida con el
      mismo regex que espera el backend. (3 tests).
- [x] `components/AdminUsersPanel.tsx` (2 tests).
- [x] `components/AdminUserRow.tsx` (2 tests).
- [x] `components/ForbiddenScreen.tsx` (1 test).

**Fase 11 cerrada 2026-09-09.** 59 tests nuevos agregados (225/225 tests en verde en
`npm run test --workspace=frontend`, 621/621 tests totales en monorepo), typecheck limpio (`npx tsc --noEmit -p frontend/tsconfig.json`).
Flujos de login (con error genérico 403), control de acceso por roles, panel de administración con gestión de archivos, usuarios y configuraciones globales (respetando la invariante de switch maestro `allowGroupDelete`) cubiertos rigurosamente.

---

<a id="fase-12"></a>

## Fase 12 — Feature: Conversations

`frontend/src/features/conversations/`

- [x] `api/conversations.api.ts` (12 tests).
- [x] `hooks/use-conversations.ts` (6 tests).
- [x] `hooks/use-conversation.ts` (6 tests).
- [x] `hooks/use-create-group.ts` (4 tests).
- [x] `hooks/use-update-conversation.ts` (3 tests).
- [x] `hooks/use-update-conversation-settings.ts` (3 tests).
- [x] `hooks/use-conversation-settings.ts` (4 tests).
- [x] `hooks/use-delete-conversation.ts` (3 tests).
- [x] `hooks/use-leave-group.ts` (3 tests).
- [x] `hooks/use-add-members.ts` (3 tests).
- [x] `hooks/use-set-member-admin.ts` (4 tests).
- [x] `hooks/use-set-conversation-preference.ts` (favorito/pinned) (8 tests).
- [x] `hooks/use-start-conversation.ts` (3 tests).
- [x] `hooks/use-open-self-chat.ts` (3 tests).
- [x] `hooks/use-new-message-sound.ts` (6 tests).
- [x] `hooks/use-long-press.ts` — test de gesto táctil sin mocks de red (4 tests).
- [x] `components/ConversationList.tsx` (8 tests).
- [x] `components/ConversationListItem.tsx` (5 tests).
- [x] `components/ConversationFilterBar.tsx` (3 tests).
- [x] `components/ConversationDetailPanel.tsx` (5 tests).
- [x] `components/ConversationOptionsMenu.tsx` (7 tests).
- [x] `components/ConversationDangerConfirmModal.tsx` — confirmación de acciones destructivas (5 tests).
- [x] `components/AddMembersModal.tsx` (5 tests).
- [x] `components/GroupSettingsSection.tsx` (5 tests).
- [x] `components/GroupMemberRow.tsx` (6 tests).

**Fase 12 cerrada 2026-09-09.** 124 tests nuevos agregados (349/349 tests en verde en `npm run test --workspace=frontend`, 745/745 tests totales en monorepo), typecheck limpio (`npx tsc --noEmit -p frontend/tsconfig.json`).
Ciclo de vida de conversaciones (listado, detalle, grupos, configuración, roles de admin de grupo, gestión de miembros, eliminación y preferencias) cubierto al 100%.

---

<a id="fase-13"></a>

## Fase 13 — Feature: Messages

`frontend/src/features/messages/` — la feature con más componentes del frontend,
tiene sentido que sea su propia fase separada de conversations.

- [x] `api/messages.api.ts`
- [x] `providers/image-lightbox-provider.tsx`
- [x] `hooks/use-messages.ts`
- [x] `hooks/use-typing.ts`
- [x] `hooks/use-forward-message.ts`
- [x] `hooks/use-message-attachments.ts`
- [x] `hooks/use-conversation-files.ts`
- [x] `hooks/use-voice-recorder.ts` — grabación de audio: mockear la Web Audio
      API/`MediaRecorder` (jsdom no la implementa) o, si el mock es demasiado
      complejo, limitar el test a la máquina de estados del hook (idle/recording/
      stopped) inyectando un `MediaRecorder` fake por parámetro/mock de módulo.
- [x] `hooks/use-message-gestures.ts`
- [x] `components/MessageList.tsx`
- [x] `components/MessageBubble.tsx` — mensaje borrado → mismo texto fijo que
      `message-preview.ts` (Fase 9), sin importar el `content` original (mismo
      criterio que `MessageBubble` documentado en el comentario de
      `conversation.service.ts` del backend — ver invariante en `TESTING_PLAN.md`
      sección 4).
- [x] `components/MessageInput.tsx`
- [x] `components/MessageOptionsMenu.tsx`
- [x] `components/MessageAttachments.tsx`
- [x] `components/AttachmentPreviewChip.tsx`
- [x] `components/AttachmentErrorModal.tsx`
- [x] `components/DeleteMessageConfirmModal.tsx`
- [x] `components/ForwardMessageModal.tsx`
- [x] `components/QuotedMessagePreview.tsx`
- [x] `components/TypingIndicator.tsx`
- [x] `components/VoiceNotePlayer.tsx`
- [x] `components/EmojiPicker.tsx`
- [x] `components/EmojiGifStickerPicker.tsx` — mockear `features/giphy/api/giphy.api.ts`
      para no depender de la Fase 14.
- [x] `components/ConversationView.tsx` — el componente contenedor de toda la feature;
      dejarlo para el final de esta fase (depende de casi todo lo de arriba, más fácil
      de testear una vez que las piezas ya están cubiertas individualmente).

---

<a id="fase-14"></a>

## Fase 14 — Feature: Files, Giphy, Notifications, Profile, Users, Settings

**Files** (`frontend/src/features/files/`)
- [ ] `api/files.api.ts`
- [ ] `components/FileTypeIcon.tsx`

**Giphy** (`frontend/src/features/giphy/`)
- [ ] `api/giphy.api.ts`

**Notifications** (`frontend/src/features/notifications/`)
- [ ] `api/push.api.ts`
- [ ] `utils/vapid-key.ts` — `urlBase64ToUint8Array()`: casos con/sin padding.
- [ ] `hooks/use-push-notifications.ts` — mockear la Push API del browser
      (`navigator.serviceWorker`, `PushManager` — no existen en jsdom, hay que
      stubearlas a mano en el test).
- [ ] `components/NotificationsBanner.tsx`

**Profile** (`frontend/src/features/profile/`)
- [ ] `hooks/use-update-profile-name.ts`
- [ ] `hooks/use-update-profile-picture.ts`
- [ ] `hooks/use-update-notification-sound.ts`
- [ ] `components/ProfileSettingsPanel.tsx`
- [ ] `components/AvatarCustomizerView.tsx`
- [ ] `components/AvatarSelectionModal.tsx`
- [ ] `components/AvatarIllustrationPicker.tsx`
- [ ] `components/BoringAvatarPicker.tsx`

**Users** (`frontend/src/features/users/`)
- [ ] `api/users.api.ts`
- [ ] `hooks/use-users.ts`
- [ ] `components/ContactRow.tsx`
- [ ] `components/NewChatModal.tsx`

**Settings** (`frontend/src/features/settings/`)
- [ ] `api/public-settings.api.ts`

---

<a id="fase-15"></a>

## Fase 15 — Auditoría de cobertura + flujos clave

Esta fase es distinta a las anteriores: no es una lista fija de archivos, es un cierre
de calidad sobre todo lo hecho en Fases 9–14. Hacerla al final, no en paralelo.

### 15.1 — Auditoría de huecos

- [ ] Correr `npm run test:coverage --workspace=frontend`.
- [ ] Listar cualquier archivo bajo `src/**/*.{ts,tsx}` (excluyendo `src/app/**` y
      `*.types.ts`) que aparezca con 0% de cobertura o que no haya sido tocado por
      ninguna fase anterior (puede pasar si se agregó código nuevo mientras este plan
      estaba en curso — ver política en `TESTING_PLAN.md` sección 6, ese código nuevo
      ya debería haber traído su test solo).
- [ ] Por cada hueco real encontrado: agregarlo como checkbox nuevo acá mismo (debajo
      de esta línea) y resolverlo antes de dar la fase por cerrada.

### 15.2 — Flujos clave (varias unidades juntas, sigue siendo mock de red/socket)

No son tests E2E (no hay browser real, `fetch`/socket siguen mockeados) — son tests
que ejercitan un hook + los componentes que lo usan juntos, para agarrar problemas de
integración entre piezas que ya están cubiertas individualmente pero nunca se
probaron combinadas:

- [ ] Login: `LoginForm` completo → submit → llama a `auth.api.ts` → estado de
      `auth-provider` se actualiza.
- [ ] Enviar un mensaje: `MessageInput` → `use-messages.ts` (o el hook que corresponda)
      → llama a `messages.api.ts` con el payload esperado.
- [ ] Panel de settings de admin: `AdminSettingsPanel` monta, carga settings vía
      `use-admin-settings.ts` (mockeado) y los muestra; togglear `allowGroupDelete` y
      guardar llama a `use-update-admin-settings.ts` con el valor correcto.

---

## Definition of Done — Frontend completo (Fases 9–15)

- [ ] Las 7 fases de este archivo tienen todos sus checkboxes en `[x]`, incluyendo
      cualquiera agregado durante la auditoría de la Fase 15.
- [ ] `npm run test --workspace=frontend` pasa completo.
- [ ] Cada fase cerrada está marcada en la tabla de `TESTING_PLAN.md` sección 5.
