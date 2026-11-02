# Estado de implementación — API v2

## Implementado en código
- Hash bcrypt de contraseñas y exclusión de datos de autenticación en las respuestas.
- Sesiones de 24 horas en SQL Server, regeneración al login, logout real y versión de credenciales para invalidar sesiones después de cambiar contraseña.
- Roles client/admin, propiedad de personas y reservas, eliminación de la elección pública de rol.
- Cookies HttpOnly/SameSite, Secure en producción, CSRF, orígenes permitidos, límites de solicitudes y cabeceras de seguridad.
- Validación estricta y respuestas uniformes sin errores internos de SQL.
- Separación de personas guardadas y pasajeros históricos de reservas.
- Reservas con precio del servidor, mejor oferta vigente, cupos calculados y bloqueo UPDLOCK del viaje dentro de transacciones.
- Cancelación idempotente y restricciones de fechas/capacidad.
- Rutas duplicadas y asociaciones corregidas; registros multi-entidad transaccionales.
- Imágenes limitadas, decodificadas y recodificadas con nombres aleatorios y limpieza al fallar el registro.
- Migración inicial reproducible para una base nueva; rechazo explícito del esquema anterior.
- Auditoría de cambios administrativos y reservas, salud/disponibilidad y arranque condicionado a SQL.
- Guía de instalación, documentación OpenAPI y registro de cambios del frontend.
- Comprobaciones automáticas de sintaxis, pruebas y dependencias en CI.

## Verificación realizada
- npm run check: correcto.
- npm test: 19 pruebas aprobadas.
- npm run test:integration: 9 pruebas aprobadas contra SQL Server real en TripAgencySecureTest.
- La integración cubre último cupo simultáneo, rollback, precios y pasajeros históricos, propiedad, cancelación idempotente, sesiones SQL, cambio de contraseña y carga/consulta/eliminación real de imágenes con asociaciones.
- Auditoría npm tras instalar las dependencias finales: 0 vulnerabilidades conocidas.
- Migración inicial aplicada correctamente mediante Sequelize CLI en TripAgencySecure y TripAgencySecureTest.
- Con la cuenta de ejecución se verificaron conexión SQL, /health/ready, sesión persistente y /api-docs.
- Se comprobó que la cuenta de ejecución no puede crear tablas, no tiene db_owner y no puede acceder a TripAgency.
- La base TripAgency original no se alteró ni se eliminaron sus datos.

## Configuración local completada
El usuario confirmó que el sistema está únicamente en desarrollo local y autorizó la preparación de las cuentas limitadas.

- TripAgencyApp tiene lectura/escritura exclusivamente en TripAgencySecure.
- TripAgencyMigrator tiene los permisos de tablas y esquema necesarios en las dos bases nuevas; no se le concedió db_owner ni permisos de administrador del servidor.
- .env, .env.migrations y .env.test contienen las conexiones correspondientes y secretos generados aleatoriamente. Están excluidos del control de versiones; no compartirlos en el proyecto del frontend.
- Los roles client y admin se crearon en las dos bases nuevas.
- Los usuarios y viajes de las pruebas están únicamente en TripAgencySecureTest. No se copiaron las cuentas anteriores a TripAgencySecure.
- La API se levantó temporalmente para verificarla y se detuvo al finalizar las pruebas. Para trabajar localmente: npm start o npm run dev.

## Próximos pasos de desarrollo
1. Crear la cuenta administradora personal: configurar ADMIN_EMAIL y ADMIN_PASSWORD en .env, ejecutar npm run admin:create y retirar esas dos variables después. No se creó una cuenta administradora con datos inventados en la base de la aplicación.
2. Adaptar el frontend usando docs/frontend-migration.md. La API está preparada, pero el frontend anterior necesita los cambios de sesión y contrato antes de usarla.
3. Verificar el recorrido desde la interfaz una vez adaptada.

## Entrega al frontend
Usar docs/frontend-migration.md en el proyecto del frontend. Incluye F01–F08 con rutas, solicitudes, respuestas, permisos y criterios de aceptación. Publicar ambos proyectos coordinadamente; el frontend anterior necesita adaptación.

## Pendientes antes de producción
- Elegir hosting/dominio, configurar HTTPS y proxies, almacenamiento persistente y credenciales propias de producción.
- Reemplazar las credenciales anteriores expuestas en archivos del proyecto.
- Verificar backup y restauración, y configurar alertas sobre fallos y disponibilidad.
- Si se usan varias instancias, mover límites de solicitudes a un almacén compartido.
- Aún no se incluyen pagos en línea, recuperación de contraseña por correo ni clave de idempotencia para crear reservas.
- Ante una respuesta perdida al reservar, el cliente debe consultar sus reservas antes de reintentar.
- Las anulaciones administrativas registran motivo; no gestionan reembolsos porque esta versión no cobra.
- Las actualizaciones de dependencias uuid y MSAL están fijadas mediante overrides; esta aplicación usa autenticación SQL por contraseña. Otros modos de Azure requieren pruebas propias.
