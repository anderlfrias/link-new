### Qué cambia y por qué

<!-- Resumen corto del cambio y del problema que resuelve. Si cierra un issue: "Closes #123". -->

### Checklist

- [ ] Si agrega o modifica comportamiento, incluye tests unitarios (ver CONTRIBUTING.md)
- [ ] `npm test` pasa localmente
- [ ] Si cambia `backend/prisma/schema.prisma`, incluye su migración (`npm run db:migrate:dev`)
- [ ] No agrega secretos, datos personales ni URLs/IPs de infraestructura real (ver SECURITY.md)
- [ ] Si cambia variables de entorno, actualiza los `.env.example` y el README
