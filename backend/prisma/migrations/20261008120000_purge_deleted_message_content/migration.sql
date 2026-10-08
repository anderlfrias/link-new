-- Migración solo de DATOS (el schema no cambia): descarta el contenido de los
-- mensajes que ya estaban eliminados ("borrar para todos" o retención).
--
-- IRREVERSIBLE. Hacer un backup de la base antes de aplicarla (pg_dump).
--
-- A partir de esta versión, borrar un mensaje vacía su texto y elimina su
-- encuesta y la relación con sus archivos en la misma transacción. Esto aplica
-- lo mismo a los mensajes que ya estaban borrados. Se conservan `deleted_at`,
-- `deleted_by_id`, las reacciones y la auditoría.
--
-- Los archivos (`stored_files`) NO se borran: los que ya no use ningún mensaje,
-- avatar ni grupo los recoge el worker de archivos huérfanos (si el admin activó
-- la limpieza de archivos). Hasta entonces siguen listados en el panel de
-- almacenamiento.

-- Encuestas de mensajes borrados. Sus opciones y votos caen por ON DELETE CASCADE.
DELETE FROM "polls"
WHERE "message_id" IN (SELECT "id" FROM "messages" WHERE "deleted_at" IS NOT NULL);

-- Relación de los mensajes borrados con sus archivos.
DELETE FROM "message_files"
WHERE "message_id" IN (SELECT "id" FROM "messages" WHERE "deleted_at" IS NOT NULL);

-- Texto de los mensajes borrados.
UPDATE "messages"
SET "content" = ''
WHERE "deleted_at" IS NOT NULL AND "content" <> '';
