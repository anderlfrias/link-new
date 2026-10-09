# Avisos de terceros

Contenido de terceros que LINK usa o distribuye, y bajo qué licencia. El código propio del proyecto
está bajo la [AGPL-3.0-only](LICENSE) (ver [README.md](README.md#licencia)).

Este resumen no es una revisión legal. Si actualizás una dependencia o un asset de esta lista,
actualizá también este archivo.

## Avatares: DiceBear

- Biblioteca: [`@dicebear/core`](https://www.dicebear.com) y `@dicebear/collection` (código bajo MIT).
- Los diseños de cada estilo tienen su propia licencia, distinta de la del código. Los estilos que
  ofrece la app están en `frontend/src/constants/avatar-catalog.ts`.
- El avatar que se guarda es una adaptación del diseño: la app lo genera con una semilla, le aplica
  el fondo elegido y lo convierte a PNG.
- Al elegir un estilo CC BY 4.0, el personalizador de avatar muestra el título de la obra, su autor,
  un enlace a la fuente y un enlace a la licencia (`frontend/src/utils/dicebear-attribution.ts`).
  Esos datos salen de los metadatos que publica cada paquete de estilo.

Estilos que exigen atribución (CC BY 4.0):

| Nombre en la app | Obra | Autor | Fuente |
|---|---|---|---|
| Aventura (`adventurer`) | Adventurer | Lisa Wischofsky | <https://www.figma.com/community/file/1184595184137881796> |
| Micah (`micah`) | Avatar Illustration System | Micah Lanier | <https://www.figma.com/community/file/829741575478342595> |
| Personas (`personas`) | Personas by Draftbit | Draftbit - draftbit.com | <https://personas.draftbit.com/> |
| Fun Emoji (`funEmoji`) | Fun Emoji Set | Davis Uche | <https://www.figma.com/community/file/968125295144990435> |
| Big Smile (`bigSmile`) | Custom Avatar | Ashley Seo | <https://www.figma.com/community/file/881358461963645496> |
| Croodles (`croodles`) | Croodles - Doodle your face | vijay verma | <https://www.figma.com/community/file/966199982810283152> |
| Dylan (`dylan`) | Dylan! The Avatar Generator | Natalia Spivak | <https://www.figma.com/community/file/1356575240759683500> |

Licencia: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). LINK modifica las obras como se
describe arriba.

Estilos en dominio público ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)), que no
exigen atribución:

| Nombre en la app | Obra | Autor | Fuente |
|---|---|---|---|
| Lorelei (`lorelei`) | Lorelei | Lisa Wischofsky | <https://www.figma.com/community/file/1198749693280469639> |
| Open Peeps (`openPeeps`) | Open Peeps | Pablo Stanley | <https://www.openpeeps.com/> |
| Notionists (`notionists`) | Notionists | Zoish | <https://heyzoish.gumroad.com/l/notionists> |
| Formas (`shapes`) | Shapes | DiceBear | <https://www.dicebear.com> |
| Anillos (`rings`) | Rings | DiceBear | <https://www.dicebear.com> |
| Cristal (`glass`) | Glass | DiceBear | <https://www.dicebear.com> |
| Pixel Art (`pixelArt`) | Pixel Art | DiceBear | <https://www.figma.com/community/file/1198754108850888330> |

Estilos con licencia propia del autor ("Free for personal and commercial use", según el archivo
`LICENSE` de cada paquete):

| Nombre en la app | Obra | Autor | Fuente |
|---|---|---|---|
| Avataaars (`avataaars`) | Avataaars | Pablo Stanley | <https://avataaars.com/> |
| Bottts (`bottts`) | Bottts | Pablo Stanley | <https://bottts.com/> |

`@dicebear/collection` también instala estilos que la app no ofrece, como `big-ears`, `miniavs` o
`toon-head`. Si se agrega uno al catálogo, hay que revisar su licencia y agregarlo acá. El test
`frontend/src/utils/dicebear-attribution.test.ts` falla si cambia la lista de estilos CC BY del
catálogo.

## Avatares por defecto: boring-avatars

[`boring-avatars`](https://github.com/boringdesigners/boring-avatars), bajo MIT. Lo usa
`frontend/src/features/profile/components/BoringAvatarPicker.tsx`.

## Íconos: Tabler Icons

[`@tabler/icons-react`](https://tabler.io/icons), bajo MIT.

## Tipografías

| Fuente | Licencia |
|---|---|
| [Inter](https://fonts.google.com/specimen/Inter) | [SIL Open Font License 1.1](https://openfontlicense.org) |
| [Baloo 2](https://fonts.google.com/specimen/Baloo+2) | [SIL Open Font License 1.1](https://openfontlicense.org) |

Se descargan de Google Fonts al compilar el frontend (`next/font/google` en
`frontend/src/app/layout.tsx`). Los archivos de fuente quedan dentro del build y los sirve el propio
frontend, así que se redistribuyen con él.

## Emoji

Los emoji son caracteres Unicode y los dibuja la fuente de emoji del sistema de cada usuario.
`frontend/src/features/messages/constants/emoji-data.ts` es solo una lista de esos caracteres. No
se incluyen imágenes de emoji de terceros.

## Sonidos

- `frontend/public/sounds/notification.wav`: síntesis propia, sin samples de terceros. Se genera
  con `node scripts/generate-notification-sound.js`.
- Tonos de llamada: los genera el navegador con Web Audio (`frontend/src/features/calls/utils/call-tones.ts`).
  No hay archivos de audio.

## GIFs y stickers: GIPHY

Los GIF y stickers son contenido de terceros que provee [GIPHY](https://giphy.com) bajo sus propios
términos. La integración está deshabilitada por defecto y no sigue varias pautas de la documentación
de GIPHY para desarrolladores. Ver
[Requisitos de GIPHY](backend/src/modules/giphy/README.md#requisitos-de-giphy) antes de activarla.

## Dependencias npm

Casi todas las dependencias de producción del backend y del frontend usan MIT, Apache-2.0, ISC o
BSD. Estas tienen licencias que conviene conocer (relevamiento del 2026-10-09 sobre las dependencias
de producción del `package-lock.json`):

| Paquete | Licencia | Por qué está |
|---|---|---|
| `web-push` | MPL-2.0 | Backend, notificaciones push. Se usa sin modificar. |
| `sharp` y su binario `@img/sharp-libvips-*` | Apache-2.0; el binario de libvips, LGPL-3.0-or-later | Dependencia opcional de Next.js para optimizar imágenes de `next/image`. Va dentro de la imagen Docker del frontend. |
| `caniuse-lite` | CC BY 4.0 | Datos de compatibilidad de navegadores que usa Next.js. |
| `elkjs` | EPL-2.0 | Lo trae Prisma Studio, incluido en el CLI `prisma`. |
| Estilos de `@dicebear/*` | MIT y CC BY 4.0, o licencia propia del autor | Ver [Avatares: DiceBear](#avatares-dicebear). |

## Marca: nombre, logo e íconos

El nombre **LINK**, el logotipo y los íconos asociados constituyen la identidad visual y los activos de marca del proyecto, y se tratan de forma independiente del código fuente:

- **Licencia de código vs. Marca**: La licencia [AGPL-3.0-only](LICENSE) cubre exclusivamente el código fuente del software. No otorga derechos de marca comercial, nombres comerciales ni transfiere automáticamente licencias sobre los elementos gráficos de la identidad visual.
- **Origen del Logotipo**: El isotipo/logo del proyecto (`frontend/public/link-logo.png` y sus variantes en `frontend/public/brand/`) fue generado utilizando la herramienta de inteligencia artificial **ChatGPT** (OpenAI). Esta mención describe el origen técnico de la imagen; no atribuye titularidad ni derechos propietarios a OpenAI, ni afirma exclusividad comercial no confirmada sobre los diseños resultantes.
- **Archivos de marca e identidad visual**:
  - `frontend/public/brand/` (logotipo, isotipo, wordmark y composiciones)
  - `frontend/public/link-logo.png`
  - `frontend/public/icons/` (íconos de aplicación y PWA)
  - `frontend/src/app/icon.png` y `frontend/src/app/apple-icon.png`
  - `frontend/public/chat-pattern-light.svg` y `frontend/public/chat-pattern-dark.svg` (patrón decorativo de fondo)

Cualquier bifurcación (*fork*) o redistribución de LINK con una denominación o identidad diferente debe reemplazar estos archivos y adaptar el componente `frontend/src/components/brand/Logo.tsx`.
