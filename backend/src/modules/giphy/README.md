# Giphy

Buscador de GIFs y stickers vía la API de [Giphy](https://developers.giphy.com/) — dos namespaces separados (`/v1/gifs/*` vs `/v1/stickers/*` de Giphy), mismo shape de respuesta, contenido distinto (los stickers vienen pensados para fondo transparente). Este módulo no persiste nada propio: solo intermedia contra Giphy para buscar/listar tendencias, y sabe convertir un resultado elegido en un `StoredFile` propio (ver [`files`](../files/README.md)) para que el resto del sistema (mensajes, adjuntos, borrado lógico, panel de admin de storage) lo trate exactamente igual que cualquier otro archivo.

Recurso plano (`/api/v1/giphy`, no anidado bajo `conversations`): un resultado de búsqueda no pertenece a ninguna conversación en particular, solo el mensaje que termina usándolo.

> **Deshabilitado por defecto.** La integración actual no sigue varias pautas de la documentación de GIPHY para desarrolladores. Antes de definir `GIPHY_API_KEY`, leé [Requisitos de GIPHY](#requisitos-de-giphy).

## Endpoints

Base: `/api/v1/giphy`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/search?kind=gifs\|stickers&q=...&limit=&offset=` | Busca por palabra clave. |
| `GET` | `/trending?kind=gifs\|stickers&limit=` | Tendencias (default del picker antes de buscar). |
| `POST` | `/import` | Descarga un resultado elegido y lo guarda como `StoredFile` propio. |

Todas requieren autenticación (`authenticate` + `attachInternalUser`), igual que `conversations`/`messages`, y además `AppSettings.allowStickersAndGifs: true` (`403` si un admin lo desactivó — ver [`settings`](../settings/README.md)). Sin `GIPHY_API_KEY` configurada (ver `.env.example`), las tres responden `503` en vez de romper el arranque del server — a diferencia de otros secretos server-only de este proyecto (VAPID), esta key es opcional en `config/env.ts` a propósito.

### `GET /search`, `GET /trending`

Reenvían la búsqueda/tendencia a Giphy (`rating=g`) y devuelven una forma recortada — nunca el JSON crudo de Giphy (trae decenas de renditions/metadata que no se usan):

```json
[{ "id": "xyz", "title": "...", "previewUrl": "https://media.giphy.com/.../200w.gif", "originalUrl": "https://media.giphy.com/.../giphy.gif", "width": 200, "height": 150 }]
```

`previewUrl` sale de la rendition `images.fixed_width` de Giphy — la que Giphy recomienda para grillas de resultados (liviana, ya animada). `originalUrl` sale de `images.original` — la rendition de calidad completa, y es la que hay que devolver en `POST /import` si se elige este resultado (ver más abajo).

### `POST /import`

```json
{ "kind": "gifs", "giphyId": "xyz", "originalUrl": "https://media.giphy.com/.../giphy.gif" }
```

A diferencia de `POST /api/v1/files` (subida directa), acá el contenido nunca llega en el body: se descarga `originalUrl` directo — **no** hay un "volver a resolver por id contra Giphy" antes de descargar. Hubo una versión anterior de este endpoint que sí lo hacía (pedirle el objeto a Giphy de nuevo por `giphyId` para sacar `images.original.url` fresco), pero **la API de Giphy no tiene un "get by id" para stickers** (`/v1/stickers/{id}` no existe, y `/v1/gifs/{id}` tampoco resuelve confiablemente un id de sticker) — ese enfoque rompía la importación de cualquier sticker. `originalUrl` en cambio ya viene resuelto en la respuesta de `GET /search`/`GET /trending` (este mismo servidor se la pidió a Giphy segundos antes, ver `giphy.service.ts#toSearchResult`), así que no hace falta un segundo viaje a Giphy — el cliente solo la devuelve tal cual la recibió.

Esto **no** reabre el problema de "confiar en una URL que manda el cliente" (el vector SSRF clásico — un servidor que descarga cualquier URL que le pidan se puede usar como proxy hacia direcciones internas, `169.254.169.254`, etc.): `importGiphyAsset` revalida `originalUrl` con `isGiphyCdnUrl()` antes de descargar — exige `https:` y que el host termine en `.giphy.com` (`media0-4.giphy.com`, `i.giphy.com`, etc., son los hosts reales desde los que Giphy sirve contenido) — `400` si no matchea. Esa validación de host es la barrera real contra SSRF ahora, no el hecho de que la URL "venga de nuestra propia respuesta anterior" (un cliente podría en teoría mandar cualquier string ahí).

Reutiliza las mismas validaciones que `uploadFile` (`AppSettings.maxUploadSizeMb`, tipo `image/*`) y el mismo `StorageProvider`/`FileRepository.createStoredFile` que usa `auth.service.ts#cacheAvatarLocally` para cachear una foto externa — mismo patrón, misma razón (guardar localmente en vez de solo linkear una URL externa que puede cambiar o dejar de existir).

→ `201` con la misma forma pública que devuelve `uploadFile` (`StoredFileResponse`, ver [`files`](../files/README.md)) — el frontend la usa exactamente igual: llama a `POST /conversations/:id/messages` con `fileIds: [<este id>]`, sin ningún endpoint de envío nuevo. Un GIF viaja como mensaje `TEXT` normal (se renderiza como cualquier imagen adjunta); un sticker manda además `type: "STICKER"` en ese mismo POST — ver `messages/README.md`.

## Por qué no se linkea la URL de Giphy directamente

> Esta decisión choca con la documentación actual de GIPHY, que pide no almacenar copias de sus medios. Ver [Requisitos de GIPHY](#requisitos-de-giphy).

Guardar como `StoredFile` propio (en vez de guardar solo la URL de Giphy en el mensaje) reutiliza TODO el pipeline existente sin código nuevo: `MessageFile`, borrado lógico, panel de admin de storage, futura retención — y no depende de que ese link de Giphy siga vivo/estable después de mandado (Giphy no garantiza URLs permanentes). El costo es previsible: un GIF/sticker pesa lo mismo que cualquier imagen ya permitida hoy, y cuenta contra `AppSettings.maxUploadSizeMb` igual que un adjunto normal.

## Requisitos de GIPHY

Comparación técnica contra la [documentación pública de la API de GIPHY](https://developers.giphy.com/docs/api/), revisada el 2026-10-06. **No es una interpretación legal de los términos de GIPHY.** Antes de habilitar GIPHY en una instalación, quien la opere tiene que revisar los términos vigentes de la API y decidir.

**Estado actual: deshabilitado por configuración.** Sin `GIPHY_API_KEY`, `/api/v1/giphy/*` responde `503` y `GET /api/v1/settings/public` informa `allowStickersAndGifs: false` (ver `settings.service.ts#getPublicSettings`). El frontend entonces oculta las pestañas de GIFs, stickers y favoritos del picker, igual que cuando un admin apaga la opción. Los GIF y stickers que ya se mandaron se siguen viendo porque son `StoredFile` propios.

Diferencias entre la implementación actual y lo que pide esa documentación:

| La documentación de GIPHY pide | LINK hoy | Dónde |
|---|---|---|
| Hacer las llamadas de búsqueda y tendencias desde el cliente. No proxiar llamadas a la API ni cargas de medios. | El backend intermedia `search` y `trending`, así la key nunca llega al navegador. | `giphy.service.ts#fetchGiphy`, `giphy.route.ts` |
| Cargar los medios directo desde las URLs que devuelve la API, sin cachearlos, proxiarlos, reescribirlos ni almacenarlos. Las excepciones requieren aprobación de GIPHY. | `POST /import` descarga la rendition original y la guarda como `StoredFile`. Los mensajes muestran esa copia. | `giphy.service.ts#importGiphyAsset`, `frontend/.../MessageInput.tsx#handleSelectGif` |
| No cachear URLs de medios sin aprobación. | Los favoritos guardan `previewUrl` y `originalUrl` en `localStorage`. | `frontend/src/features/messages/lib/favorites-store.ts` |
| Mostrar la marca "Powered By GIPHY" donde se usa la API. | El picker no muestra atribución. | `frontend/src/features/messages/components/EmojiGifStickerPicker.tsx` |
| No filtrar ni reordenar los resultados. | Se descartan los resultados que no traen las renditions `fixed_width` y `original`. | `giphy.service.ts#toSearchResult` |
| No mezclar contenido de GIPHY con el de otros proveedores en la misma grilla. | La grilla de stickers favoritos mezcla stickers de GIPHY con stickers guardados desde el chat, que son archivos de LINK. | `EmojiGifStickerPicker.tsx` |
| Recomendado (no obligatorio): renditions MP4/WEBP y eventos de analytics (Action Register). | Usa `.gif` y no manda analytics. | `giphy.service.ts#toSearchResult` |

Además, las keys nuevas de GIPHY son "beta", limitadas a 100 llamadas por hora. Para producción hay que pedirle a GIPHY una key de producción.

### Cambios técnicos necesarios para alinearla

No están implementados. Cambian el modelo de datos y cómo se ven los mensajes, así que conviene decidirlos junto con los términos de GIPHY:

1. Buscar y listar tendencias desde el navegador con una key de GIPHY para web, que queda expuesta al cliente (por ejemplo `NEXT_PUBLIC_GIPHY_API_KEY`), y quitar `GET /search` y `GET /trending` del backend.
2. Reemplazar `POST /import`. El mensaje guardaría la referencia de GIPHY (id y URLs de la rendition, sin tocar sus query params) y el frontend mostraría el medio directo desde los servidores de GIPHY. Hace falta un campo o tipo de mensaje nuevo (migración de Prisma), cambios en `MessageBubble`, y decidir qué pasa con los GIF que ya se importaron.
3. Mostrar la marca oficial "Powered By GIPHY" en el picker, con los assets y las pautas de uso que publica GIPHY.
4. No descartar resultados, separar la grilla de favoritos por proveedor y revisar si los favoritos pueden guardar URLs de GIPHY.
5. Opcional: renditions MP4/WEBP y analytics.

Problema conocido del flujo actual: un GIF marcado como favorito desde un mensaje (`MessageBubble`) guarda la URL del archivo de LINK como `originalUrl`. Al reenviarlo desde favoritos, `POST /import` lo rechaza con `400` porque no es un host de GIPHY. Se resolvería dentro del rediseño de arriba.
