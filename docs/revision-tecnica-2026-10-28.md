# Revisión técnica de TripAgency

Fecha: 28 de octubre de 2026, America/Santo_Domingo.

## Valoración

**7/10 como backend en desarrollo. Todavía no lo considero listo para producción.** Es una valoración de ingeniería, no una certificación ni una medida automática.

El proyecto tiene una base sólida para una agencia pequeña: separa responsabilidades, protege la autenticación y concentra las reglas importantes de las reservas en transacciones. Los principales problemas encontrados son de funcionamiento público, edición de relaciones, cobertura de escenarios y operación.

Esta carpeta contiene una API con Express, Sequelize y SQL Server. No contiene el frontend ni un despliegue de producción que permitan evaluar la experiencia completa del sistema.

## Qué se revisó y comprobó

- Arranque HTTP, configuración SQL y sesiones.
- Todas las rutas, controladores, servicios, modelos y middleware del proyecto.
- Migración inicial, scripts de preparación y administración.
- Pruebas generales y de integración, flujo de CI y documentación OpenAPI.
- Dependencias mediante `npm audit`.
- Reproducciones adicionales para visitantes sin sesión, edición de destinos y consultas del listado.

Resultados de esta revisión:

| Comprobación | Resultado |
| --- | --- |
| `npm run check` | Sintaxis correcta |
| `npm test` | 19/19 aprobadas |
| `npm run test:integration` | 9/9 aprobadas con SQL Server real |
| `npm audit --json` | 0 vulnerabilidades conocidas reportadas |
| Consultas públicas sin sesión | 6 rutas probadas devolvieron 500 |
| Edición de destinos relacionados con imágenes | Conflicto de clave foránea, SQL Server 547 |
| Listado de viajes, página de hasta 20 | 17 viajes devueltos y 19 consultas SQL |

La primera ejecución de las pruebas HTTP falló porque el entorno restringido impedía conectar a 127.0.0.1. Al ejecutarlas con acceso local, las 19 aprobaron. Ese bloqueo no se atribuye al proyecto.

La integración existente crea y conserva datos identificados en TripAgencySecureTest. La reproducción adicional de destinos utilizó una transacción revertida. No se modificó el código de la aplicación ni la base principal. Se añadió únicamente este informe al proyecto.

## Fallos confirmados

### 1. Prioridad alta: el catálogo público falla sin iniciar sesión

Ubicación: `middleware/auth.js:27`, `controllers/tripController.js:13` y `routes/catalogRouter.js:12`.

`isAdmin` accede a `user.Rol` aunque `user` puede ser undefined. La protección opcional de `Rol` no protege el acceso inicial a `user`.

Reproducción sin cookie de sesión:

| Solicitud | Resultado |
| --- | --- |
| `GET /api/trips` | 500 INTERNAL_ERROR |
| `GET /api/trips/1` | 500 INTERNAL_ERROR |
| `GET /api/oferts` | 500 INTERNAL_ERROR |
| `GET /api/oferts/1` | 500 INTERNAL_ERROR |
| `GET /api/destinies` | 500 INTERNAL_ERROR |
| `GET /api/tripImageDestinies` | 500 INTERNAL_ERROR |

Impacto: una persona que entra por primera vez no puede explorar el catálogo, aunque el contrato documenta acceso público. El error ocurre antes de consultar los modelos del catálogo.

Corrección propuesta: hacer que `isAdmin` acepte un usuario ausente, por ejemplo `user?.Rol?.RolName === 'admin'`, y probar listados y detalles públicos con datos existentes, inexistentes y archivados.

### 2. Prioridad media: editar destinos deja de funcionar cuando tienen imágenes relacionadas

Ubicación: `controllers/tripController.js:52` y `models/schema.js:62`.

Al recibir `destinations`, el controlador borra todos los destinos actuales y luego los vuelve a crear. Si un destino está referenciado en `TripImageDestiny`, SQL Server impide el borrado por la clave foránea con NO ACTION. La reproducción devolvió `SequelizeForeignKeyConstraintError`, número 547; en HTTP se transforma en 409 REFERENCED_RESOURCE.

Impacto: una edición normal del itinerario queda bloqueada después de asociar imágenes. La transacción evita una modificación parcial, pero la operación no se puede completar mediante ese flujo.

Corrección propuesta: actualizar destinos conservando sus identificadores y gestionar explícitamente los eliminados y sus asociaciones. Evitar borrar y recrear toda la colección para cambiar un nombre. Añadir una prueba de edición posterior a la asociación de imágenes.

## Debilidades de diseño y mantenimiento

### 3. Prioridad media: el listado hace consultas adicionales por cada viaje

Ubicación: `controllers/tripController.js:8` y `controllers/tripController.js:12`.

El listado obtiene los viajes y después llama a `occupied` una vez por viaje. En esta revisión, devolver 17 viajes produjo 19 consultas SQL: conteo, lectura y 17 conteos de ocupación.

Además, incluir simultáneamente tres relaciones de uno a muchos —destinos, imágenes y ofertas— puede multiplicar las filas intermedias del resultado SQL. La paginación limita los viajes, pero no el número de elementos de cada relación.

Impacto: más carga sobre SQL y más espera al crecer el catálogo o el tráfico. No se realizó una prueba de carga y no se afirma un límite concreto de usuarios.

Corrección propuesta: calcular ocupación agrupada para todos los viajes de la página y evaluar lecturas separadas de las colecciones para evitar multiplicar filas.

### 4. Prioridad media: las pruebas pasan, pero omiten recorridos relevantes

Ubicación: `tests/http.test.js`, `tests/integration/system.test.js` y `.github/workflows/ci.yml:12`.

Las pruebas existentes verifican controles importantes, pero no prueban el catálogo anónimo ni la edición de destinos después de asociar imágenes. Por eso las 28 pruebas pasan pese a los dos fallos reproducidos.

El flujo de CI ejecuta sintaxis, pruebas generales y auditoría npm. No ejecuta las pruebas de integración con SQL Server.

Corrección propuesta: incorporar las dos regresiones, ampliar la matriz visitante/cliente/admin y ejecutar integración contra una base SQL aislada en CI. No se midió un porcentaje de cobertura.

### 5. Prioridad media: los registros de errores aportan poca información para diagnosticar

Ubicación: `middleware/errorHandler.js:18`.

En errores internos se registra el identificador de solicitud y el nombre del error. No se registra su mensaje, stack ni el contexto de ruta. Un TypeError del catálogo queda identificado como TypeError sin señalar la línea causante.

Corrección propuesta: mantener respuestas públicas genéricas y registrar internamente contexto, stack y causa con ocultación de secretos y datos personales.

### 6. Prioridad media: borrar una imagen puede dejar archivo y base de datos descoordinados

Ubicación: `controllers/imgController.js:30` y `controllers/imgController.js:38`.

La eliminación SQL se confirma antes de borrar el archivo físico. Si el sistema de archivos falla, la API devuelve un error cuando el registro ya desapareció, y el archivo puede seguir siendo servido por `/uploads`. Reintentar por el mismo identificador devolverá 404 y no recuperará esa limpieza.

Este escenario se deduce del orden de las operaciones; no se provocó una falla real del disco.

Corrección propuesta: registrar una tarea de limpieza duradera con reintentos y reconciliación de archivos huérfanos.

### 7. Prioridad baja: hay dos formas de representar imagen y destino

Ubicación: `models/schema.js:36` y `models/schema.js:62`.

Existe `Img.IdDestiny` y también la tabla `TripImageDestiny`. La subida crea imágenes con IdTrip y la asociación pública de administración escribe en la tabla intermedia. No hay un flujo que mantenga ambas representaciones sincronizadas.

Impacto: consultar `Img.Destiny` puede expresar algo distinto de consultar la tabla intermedia. También dificulta decidir cómo editar y borrar destinos.

Corrección propuesta: definir si una imagen pertenece a uno o varios destinos y mantener una única fuente de verdad.

## Aspectos bien resueltos

- Contraseñas con bcrypt y factor de trabajo 12; exclusión de campos de autenticación en respuestas públicas.
- Regeneración de sesión al iniciar sesión, cookies HttpOnly y Secure en producción, expiración e invalidación mediante AuthVersion.
- CSRF, orígenes permitidos, Helmet y límites de solicitudes.
- Roles controlados por el servidor y validación de propiedad de personas y reservas.
- Validación estricta con Zod: el cliente no puede imponer precio, propietario, rol ni cupos disponibles.
- Precio calculado en el servidor con redondeo por pasajero y descuento vigente.
- Bloqueo UPDLOCK del viaje y transacciones para impedir sobreventa; la prueba concurrente del último cupo pasó.
- Datos históricos de pasajeros y precios conservados en la reserva.
- Cancelaciones idempotentes y registro de operaciones administrativas y reservas.
- Imágenes decodificadas y recodificadas, con límites de tipo, tamaño y píxeles.
- Migración congelada y reproducible para una base nueva; el arranque no altera tablas automáticamente.
- Documentación de instalación, contrato de API y guía de adaptación del frontend.

## Limitaciones de producto y operación

Son capacidades pendientes o decisiones de alcance, no todas son errores de programación:

- No hay recuperación de contraseña por correo ni verificación de correo implementadas en estas rutas.
- No hay pagos ni reembolsos; esta API gestiona reservas sin cobro en línea.
- La creación de reservas no admite clave de idempotencia. Una respuesta perdida exige consultar las reservas para resolver qué ocurrió. La comprobación de pasajeros ya reservados sí bloquea la repetición exacta mientras la reserva siga activa; no se comprobó una duplicación de reservas por reintento.
- Los límites de solicitudes están en memoria. Varias instancias necesitan un almacén compartido para mantener un límite conjunto.
- Los archivos requieren almacenamiento persistente y una estrategia de copias de seguridad junto con SQL.
- La documentación registra como pendientes HTTPS, proxies, alertas, comprobación de restauración y sustitución de credenciales antiguas expuestas. Esta revisión no certifica que esos pasos se hayan completado fuera del proyecto.
- El frontend no está en esta carpeta. La guía reconoce cambios incompatibles de sesión y contrato; falta verificar el recorrido desde la interfaz adaptada.
- La migración inicial exige una base nueva: trasladar datos del esquema anterior requiere un proceso adicional.
- Esta copia no tiene un repositorio Git detectable. No se pudo verificar historial de secretos, ramas, revisiones ni ejecuciones reales de CI.

## Orden recomendado

1. Reparar y probar el catálogo sin sesión.
2. Reparar la edición de destinos relacionados con imágenes.
3. Incorporar esas regresiones y automatizar integración SQL en CI.
4. Reducir consultas del listado, mejorar diagnóstico y hacer recuperable la limpieza de imágenes.
5. Unificar el modelo imagen-destino.
6. Validar el frontend y completar la preparación operativa antes de publicar.

El proyecto permite continuar con mejoras concretas sobre la estructura existente. Lo revisado no justifica una reescritura completa.
