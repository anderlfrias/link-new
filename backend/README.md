# Backend — Arquitectura

Este documento describe la organización del backend. La arquitectura es **modular (feature-based)**: cada funcionalidad del sistema vive en su propio módulo autocontenido dentro de `src/modules`.

```text
backend/
│
├── prisma/
│
├── src/
│   │
│   ├── config/
│   │
│   ├── modules/
│   │
│   ├── middlewares/
│   │
│   ├── socket/
│   │
│   ├── storage/
│   │
│   ├── workers/
│   │
│   ├── utils/
│   │
│   ├── constants/
│   │
│   ├── types/
│   │
│   ├── app.ts
│   │
│   └── server.ts
│
├── uploads/
│
└── README.md
```

---

## prisma

Contendrá el esquema de Prisma (`schema.prisma`) y las migraciones generadas.

No debe contener lógica de negocio, servicios ni repositorios. Es exclusivamente la definición del modelo de datos y su historial de migraciones.

---

## src/config

Aquí van los archivos de configuración y carga de variables de entorno de la aplicación.

Ejemplos futuros:

* `env.ts` (lectura y validación de variables de entorno)
* `database.ts` (configuración de conexión)
* `cors.ts`
* `socket.config.ts`

---

## src/modules

Toda la funcionalidad del sistema debe vivir aquí. Cada módulo representa una feature del negocio (por ejemplo `messages`, `users`, `auth`) y debe ser lo más **independiente** posible del resto.

Un módulo contendrá únicamente los archivos que realmente necesite, ni uno más.

No se deben crear subcarpetas innecesarias dentro de un módulo.

### Ejemplo de módulo

```text
messages/

├── message.controller.ts

├── message.service.ts

├── message.repository.ts

├── message.routes.ts

├── message.socket.ts

└── message.validator.ts
```

* Si el módulo es pequeño, se mantienen los archivos planos (como en el ejemplo anterior).
* Cuando el módulo crezca, se podrán crear subcarpetas como `dto/`, `validators/`, `interfaces/`, únicamente cuando realmente aporten organización.

---

## src/middlewares

Middlewares globales de Express, compartidos por toda la aplicación (por ejemplo manejo de errores, autenticación transversal, logging de peticiones).

Los middlewares específicos de un módulo deben vivir dentro de ese módulo, no aquí.

---

## src/socket

Contendrá únicamente la configuración global de Socket.IO (inicialización del servidor de sockets, adjuntarlo al servidor HTTP, configuración de CORS de sockets, etc.).

Cada módulo es responsable de registrar sus propios eventos de socket (por ejemplo `message.socket.ts` dentro del módulo `messages`).

---

## src/storage

Esta carpeta **no almacena archivos**.

Aquí viven únicamente los proveedores de almacenamiento (por ejemplo `LocalDiskStorage`, `MinIOStorage`, `S3Storage`) que exponen una interfaz común para guardar y leer archivos, sin importar el backend físico utilizado.

---

## src/workers

Procesos en segundo plano (background jobs), como colas de tareas, cron jobs o procesamiento asíncrono desacoplado del ciclo petición-respuesta.

---

## src/utils

Funciones reutilizables **sin lógica de negocio** (helpers genéricos: formateo de fechas, manejo de strings, utilidades matemáticas, etc.).

---

## src/constants

Constantes globales compartidas por toda la aplicación (por ejemplo códigos de error, valores por defecto, enumeraciones globales).

---

## src/types

Tipos y definiciones TypeScript globales del backend, compartidos entre módulos.

Los tipos específicos de un módulo deben vivir dentro de ese módulo.

---

## uploads

Almacenamiento físico de archivos locales durante el desarrollo, o cuando se utilice almacenamiento en disco (`LocalDiskStorage`) en lugar de un proveedor externo (S3, MinIO, etc.).

---

# Principios

* La arquitectura está organizada por módulos (feature-based).
* Cada módulo debe ser lo más independiente posible.
* La lógica de negocio vive en los servicios.
* Los controladores únicamente reciben la petición y delegan al servicio.
* Los repositorios son los únicos que interactúan directamente con la base de datos.
* No colocar lógica de negocio en controladores.
* No colocar consultas Prisma fuera de los repositorios.
* Crear subcarpetas únicamente cuando realmente sean necesarias.
* Priorizar simplicidad antes que sobreingeniería.
* Mantener cada módulo autocontenido.
