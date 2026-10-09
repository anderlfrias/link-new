# Guía de Versionamiento y Publicación de Versiones

Este documento define el estándar y procedimiento oficial para el versionamiento, mantenimiento del registro de cambios y publicación de nuevas versiones de la aplicación **LINK**.

---

## 1. Estándares Adoptados

El proyecto se rige por dos estándares fundamentales de la industria del software:

1. **[Semantic Versioning 2.0.0 (SemVer)](https://semver.org/lang/es/)**: Regula la nomenclatura numérica de cada versión según el impacto del cambio.
2. **[Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/)**: Regula la estructura y redacción del archivo [CHANGELOG.md](CHANGELOG.md).

---

## 2. Esquema de Versiones (SemVer)

El formato de versión consta de tres números separados por puntos:

$$\text{MAJOR}.\text{MINOR}.\text{PATCH}$$

Ejemplo: `1.0.0`

### ¿Cuándo incrementar cada componente?

| Componente | Tipo de Cambio | Cuándo Usarlo | Ejemplos en este Proyecto |
| :--- | :--- | :--- | :--- |
| **MAJOR** (X.0.0) | Incompatible (*Breaking*) | Cambios en la API, protocolo Socket.IO, esquema de base de datos, autenticación o interfaz de los proveedores de autenticación (`AUTH_PROVIDER_API_VERSION`, ver [docs/auth-providers.md](docs/auth-providers.md)) que **rompen compatibilidad** con clientes o plugins anteriores o requieren migraciones manuales no retrocompatibles. | Modificar contratos de eventos de Socket existentes sin retrocompatibilidad, reestructuración radical del modelo de datos de Prisma que no permita coexistencia. |
| **MINOR** (1.X.0) | Funcionalidad compatible | Nuevas características o mejoras que **no rompen** el funcionamiento existente de clientes o servidores anteriores. | Agregar llamadas grupales, añadir soporte para un nuevo idioma, nuevos filtros en el panel de administración, nuevos tipos de adjuntos. |
| **PATCH** (1.0.X) | Corrección de errores | Corrección de bugs (*bugfixes*), parches de seguridad, optimizaciones de rendimiento internas o ajustes de UI menores que preservan los contratos existentes. | Corregir un error de scroll en una lista, solucionar un edge case de expiración de sesión, parchar una vulnerabilidad de dependencia, corregir un tipo TypeScript. |

---

## 3. Política de Versión Unificada (Monorepo)

Este proyecto es un monorepo gestionado con **npm Workspaces** compuesto por:
- `package.json` (raíz del proyecto)
- `backend/package.json` (servicio Express + Prisma)
- `frontend/package.json` (aplicación Next.js)
- `frontend/src/constants/app-version.constant.ts` (constante expuesta en la interfaz de usuario)

**Regla de oro:** Todos los paquetes del monorepo y la constante de interfaz deben compartir **exactamente la misma versión**.

Para garantizar esto sin errores manuales, se cuenta con el script automatizado:

```bash
npm run version:sync
```

Dicho script lee la versión del `package.json` raíz y la propaga a los submódulos y a la constante `APP_VERSION`.

---

## 4. Mantenimiento de `CHANGELOG.md`

Toda adición, cambio o corrección debe quedar registrada en el archivo [CHANGELOG.md](CHANGELOG.md).

### Categorías Estándar Permitidas

Bajo el encabezado de cada versión, los cambios deben agruparse únicamente en las siguientes secciones (utilizar solo las que apliquen):

- `### Añadido`: Nuevas funcionalidades introducidas.
- `### Cambiado`: Modificaciones sobre comportamientos o interfaces existentes.
- `### Obsoleto`: Funcionalidades que pronto serán eliminadas.
- `### Eliminado`: Funcionalidades retiradas definitivamente.
- `### Corregido`: Solución a bugs o fallos reportados.
- `### Seguridad`: Mejoras de seguridad o parches ante vulnerabilidades.

### Flujo de la sección `[Unreleased]`
Durante el desarrollo diario en la rama principal o ramas de funcionalidad, las notas de cambios deben anotarse provisionalmente bajo `## [Unreleased]`. Al momento de preparar la publicación formal, estos puntos se trasladan al bloque de la nueva versión con su fecha de lanzamiento.

---

## 5. Procedimiento Paso a Paso para Publicar una Nueva Versión

Sigue estrictamente estos pasos cada vez que corresponda publicar una versión:

### Paso 1: Verificación de Calidad y Pruebas
Antes de tocar cualquier versión, asegúrate de que el código esté en perfecto estado:

```bash
# 1. Correr todos los tests unitarios y de integración (backend y frontend)
npm test

# 2. Verificar que ambos proyectos compilen sin errores
npm run build

# 3. Comprobar que el árbol de Git esté limpio y sin cambios pendientes
git status
```

> [!IMPORTANT]
> Nunca generes una versión si existen pruebas fallidas o si `npm run build` arroja errores.

---

### Paso 2: Actualizar `CHANGELOG.md`
1. Abre [CHANGELOG.md](CHANGELOG.md).
2. Si hay notas bajo `## [Unreleased]`, muévelas bajo un nuevo encabezado con el número de versión y la fecha de hoy en formato ISO (`YYYY-MM-DD`):
   ```markdown
   ## [Unreleased]

   ## [1.1.0] - 2026-10-15

   ### Añadido
   - ...
   ```
3. Verifica que la redacción sea clara y orientada a valor para el usuario y el equipo técnico.

---

### Paso 3: Incrementar la Versión

Ejecuta el comando correspondiente al tipo de incremento:

```bash
# Para una corrección de errores (ej. 1.0.0 -> 1.0.1):
npm version patch --no-git-tag-version

# Para una nueva funcionalidad (ej. 1.0.0 -> 1.1.0):
npm version minor --no-git-tag-version

# Para un cambio incompatible (ej. 1.0.0 -> 2.0.0):
npm version major --no-git-tag-version
```

A continuación, sincroniza los paquetes hijos y la constante de interfaz:

```bash
npm run version:sync
```

---

### Paso 4: Crear el Commit de Release
De acuerdo con las reglas de Git del proyecto, los mensajes de commit deben estar en **español**, en modo **imperativo**, comenzar con la etiqueta de acción correspondiente y **sin punto final**:

```bash
# Agregar los archivos modificados
git add package.json backend/package.json frontend/package.json frontend/src/constants/app-version.constant.ts CHANGELOG.md package-lock.json

# Realizar el commit de release (ejemplo para versión 1.1.0)
git commit -m "[update] chore(release): preparar versión 1.1.0"
```

---

### Paso 5: Crear el Tag de Git
Crea un tag anotado prefijado con `v`:

```bash
# Sintaxis: git tag -a v<VERSION> -m "Release v<VERSION>"
git tag -a v1.1.0 -m "Release v1.1.0"
```

---

### Paso 6: Publicar al Repositorio Remoto
Envía el commit y los tags al repositorio central:

```bash
git push origin main --follow-tags
```

Al llegar el tag `v*`, el workflow [Publicar imágenes](.github/workflows/release-images.yml) verifica que el tag
esté en `main` y coincida con la versión (`package.json` de la raíz, backend y frontend, `package-lock.json`,
`APP_VERSION` y el `CHANGELOG.md`: `scripts/release-consistency.test.js`) y publica en GHCR `link-backend` y
`link-frontend` con ese número de versión (`X.Y.Z` y `X.Y`; `latest` solo en versiones finales).

Para probar el workflow sin publicar nada (por ejemplo, después de actualizar una acción), ejecutarlo a mano
desde Actions > Publicar imágenes > Run workflow: hace los mismos pasos y construye las dos imágenes, pero no
se loguea en GHCR ni las sube. La primera vez que se publica una imagen, GHCR la crea como **privada**: para
que cualquiera pueda hacer `docker pull`, cambiar su visibilidad a pública en la configuración del paquete.

---

### Paso 7: Actualizar una instalación
En una instalación con PM2 (`ecosystem.config.js`):

```bash
# 1. Obtener la última versión y tags
git pull origin main

# 2. Instalar dependencias si hubo cambios
npm ci

# 3. Aplicar migraciones si hubo cambios en Prisma
npm run prisma:sync

# 4. Compilar ambos proyectos
npm run build

# 5. Reiniciar los procesos en PM2 sin downtime
pm2 reload ecosystem.config.js

# 6. Verificar el estado de los procesos y logs
pm2 status
pm2 logs --lines 50
```

En una instalación con Docker (`docker-compose.yml`), el backend aplica las migraciones al arrancar:

```bash
git pull origin main
docker compose up -d --build
docker compose ps
```

Con las imágenes publicadas (ver el README), alcanza con cambiar el número de versión de la imagen del backend
(y reconstruir la del frontend con las URLs propias): sin merges ni compilar el backend en el servidor. Un
proveedor de autenticación externo que se agrega extendiendo la imagen del backend se actualiza igual:
nueva versión de la imagen base, reconstruir, y correr los tests del proveedor (ver
[docs/auth-providers.md](docs/auth-providers.md)).

---

## 6. Referencia Rápida de Comandos (Cheat Sheet)

### Para un Parche (Patch - Bugfix):
```bash
npm test && npm run build
# (Editar CHANGELOG.md)
npm version patch --no-git-tag-version
npm run version:sync
git add package.json backend/package.json frontend/package.json frontend/src/constants/app-version.constant.ts CHANGELOG.md package-lock.json
git commit -m "[update] chore(release): preparar versión X.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main --follow-tags
```

### Para una Funcionalidad Menor (Minor - Feature):
```bash
npm test && npm run build
# (Editar CHANGELOG.md)
npm version minor --no-git-tag-version
npm run version:sync
git add package.json backend/package.json frontend/package.json frontend/src/constants/app-version.constant.ts CHANGELOG.md package-lock.json
git commit -m "[update] chore(release): preparar versión X.Y.0"
git tag -a vX.Y.0 -m "Release vX.Y.0"
git push origin main --follow-tags
```

---

## 7. Manejo de Errores y Rollback

Si por error se publicó un tag erróneo local o remotamente:

```bash
# Eliminar tag localmente:
git tag -d vX.Y.Z

# Eliminar tag remoto:
git push origin :refs/tags/vX.Y.Z
```

Si una versión recién desplegada introduce un fallo crítico en producción:
1. Revertir temporalmente al tag estable previo: `git checkout v<ANTERIOR>`.
2. Reconstruir y reiniciar: `npm run build && pm2 reload ecosystem.config.js` (con Docker, `docker compose up -d --build`). Si la versión nueva aplicó migraciones, revisar antes si la anterior funciona con ese schema.
3. Desarrollar la corrección en una rama de hotfix.
4. Generar una nueva versión `PATCH` documentando el incidente y solución en `CHANGELOG.md`.
