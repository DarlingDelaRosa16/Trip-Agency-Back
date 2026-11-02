# TripAgency API

Backend de viajes con Express, Sequelize y SQL Server. Node.js >=22.14.0.

## Estado local actual
La configuración y las migraciones ya están aplicadas en TripAgencySecure y TripAgencySecureTest. Las 19 pruebas generales y las 9 de integración con SQL Server pasaron. Los archivos .env locales ya existen; no vuelvas a ejecutar db:setup:local en esta instalación.

Para arrancar: npm start o npm run dev. La cuenta administradora personal se crea con el paso 5 de Preparación. Los usuarios de la base anterior no se trasladaron a la base nueva.

## Preparación
1. Instalar dependencias: npm ci.
2. Usar una base nueva llamada TripAgencySecure. La migración rechaza el esquema anterior para conservar los datos.
3. Copiar .env.example a .env y configurar conexión y SESSION_SECRET (32 caracteres o más).
4. Crear .env.migrations con conexión de migración y ejecutar npm run db:migrate.
5. Configurar ADMIN_EMAIL y ADMIN_PASSWORD en .env, ejecutar npm run admin:create y retirar esas dos variables.
6. Ejecutar npm start. /api-docs contiene el contrato; /health/live y /health/ready sirven para supervisión.

En Windows con SQLEXPRESS se incluye npm run db:setup:local como ayuda opcional. Crea cuentas y bases nuevas, necesita acceso administrativo de Windows a SQL Server y debe autorizarse expresamente. No modifica TripAgency ni reemplaza cuentas existentes. Usa una cuenta de lectura/escritura para la aplicación y otra con permisos de tablas y esquema para migraciones.

El servidor no crea ni altera tablas al arrancar. No usar sync({ alter: true }) ni sync({ force: true }).

## Desarrollo y pruebas
- npm run dev
- npm test: validaciones, seguridad HTTP y comprobaciones locales; no necesita SQL Server.
- npm run test:integration: requiere .env.test con NODE_ENV=test y DB_NAME terminado en Test, y las migraciones aplicadas.
- Aplicar migraciones de pruebas: node --env-file=.env.test node_modules/sequelize-cli/lib/sequelize db:migrate --config config/cli.js.
- Las pruebas de integración crean datos identificados en la base de pruebas y los conservan para inspección. Nunca se ejecutan sobre la base de la aplicación.

## Diseño
- app.js configura HTTP; index.js conecta SQL antes de aceptar tráfico.
- routes define contratos y permisos; controllers coordina solicitudes.
- services contiene autenticación, reservas y archivos.
- models/schema.js define modelos y asociaciones una sola vez.
- migrations/schema/v1.js es la copia congelada del esquema inicial; no actualizarla junto con los modelos.
- Cambios del frontend: docs/frontend-migration.md.
- Estado y pendientes de publicación: docs/implementation-status.md.

## Producción
- HTTPS, frontend y API bajo el mismo dominio; cookies Secure, HttpOnly y SameSite=Lax.
- FRONTEND_ORIGINS contiene únicamente los orígenes autorizados; TRUST_PROXY_HOPS debe reflejar exactamente los proxies de confianza.
- Usar una cuenta SQL sin permisos DDL para ejecutar la aplicación. Conservar credenciales de migración fuera del proceso web.
- DB_ENCRYPT=true y certificado SQL válido. La confianza en certificados autofirmados solo se permite en desarrollo.
- Montar uploads como almacenamiento persistente.
- Reemplazar las credenciales de la base anterior que estuvieron en el código. Las credenciales nuevas no se versionan.
- Hacer una copia de seguridad y verificar una restauración antes de usar datos reales.
- Los límites de solicitudes actuales viven en memoria: ejecutar una instancia. Para varias instancias, configurar un almacén compartido de límites.
- Validar y publicar backend y frontend de forma coordinada.
