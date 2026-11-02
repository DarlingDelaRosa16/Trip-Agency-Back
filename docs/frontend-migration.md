# Cambios necesarios en el frontend — API v2

Este documento es el contrato para adaptar el frontend en su propio proyecto. No contiene cambios de interfaz implementados aquí.

## F01. Cliente HTTP, cookies y CSRF
- Mantener /api como prefijo. En desarrollo configurar el proxy de /api y /uploads hacia localhost:3000; se permite también http://localhost:5173 con credenciales.
- fetch debe usar credentials: 'include'; Axios debe usar withCredentials: true.
- Al iniciar la aplicación: GET /api/user/csrf. Guardar data.csrfToken en memoria.
- En POST, PUT y DELETE enviar X-CSRF-Token. Esto incluye registro, login y logout. Multipart utiliza la misma cabecera.
- POST /api/user/login devuelve { data: { user, csrfToken }, message, status, error }. Reemplazar el token después de login.
- GET /api/user/me devuelve el mismo objeto para recuperar la cuenta. No guardar contraseñas ni un usuario local como prueba de sesión.
- POST /api/user/logout invalida la sesión del servidor; limpiar estado y token local, y obtener un CSRF nuevo antes de otro login.
- 401: limpiar usuario y dirigir al login. CSRF_INVALID: obtener token nuevo y pedir reintentar; no reenviar automáticamente reservas.
- Criterio: una recarga conserva la sesión y un logout impide usarla nuevamente.

## F02. Registro, perfil y roles
POST /api/user/create:
~~~json
{
  "email": "cliente@example.com",
  "password": "una-clave-de-12-o-mas",
  "personData": {
    "PersonName": "Ana",
    "PersonLastname": "Pérez",
    "Dni": "documento",
    "Phone": "8095550100"
  }
}
~~~
- Eliminar rolId, IdRol, OwnerId y cualquier campo administrativo del formulario.
- Contraseña: mínimo 12 caracteres y máximo 72 bytes UTF-8.
- Registro no inicia sesión automáticamente: mostrar confirmación y permitir login.
- Roles: user.Rol.RolName es client o admin. Adaptar navegación; el servidor comprueba permisos.
- POST /api/user/change-password con { currentPassword, password }: invalida todas las sesiones; solicitar login.
- Usar Dni, no DNI. Sex opcional acepta M, F u O; fechas YYYY-MM-DD.
- Criterio: no se puede elegir un rol administrativo al registrarse.

## F03. Respuestas, listados y errores
- Respuesta uniforme: { data, message, status, error }.
- Listados: data = { items, total, page, pageSize }; dejar de leer data.trips y arrays directos.
- Parámetros: ?page=1&pageSize=20; máximo 100. Reiniciar página cuando cambie una vista.
- Excepción: /api/roles es un catálogo pequeño y devuelve array.
- 422: error.details contiene [{ field, message }]. Mostrar errores junto al campo, incluidos nombres anidados como personData.PersonName.
- 403: permisos o CSRF; 404: recurso ausente/ajeno; 409: conflicto de negocio; 429: esperar y reintentar manualmente.
- error.requestId sirve para soporte. No mostrar mensajes de SQL.
- Criterio: carga, vacío, error y conflicto tienen estados visibles.

## F04. Personas guardadas y selección de pasajeros
- GET/POST /api/person; GET/PUT/DELETE /api/person/:id.
- POST/PUT reciben directamente los datos de persona, sin { dataPerson, IdUser }.
- Un cliente ve sus personas. El perfil del titular aparece como persona seleccionable; no viaja automáticamente.
- Eliminar el consumo de /api/reservacionUserPersons: devuelve 410.
- PUT de persona requiere PersonName y PersonLastname, además de los opcionales que se quieran modificar.
- El borrado devuelve 409 si existe cuenta o historial asociado.
- Criterio: seleccionar pasajeros explícitamente, sin repetir y usando sus IdPerson.

## F05. Viajes y ofertas
- GET /api/trips y GET /api/trips/:id devuelven Destinations, Images, Offers y OpenPositions calculado.
- Clientes y visitantes solo ven viajes activos. TripStatus false indica viaje archivado.
- Crear viaje (admin): POST /api/trips con { trip: { TripName, StartDate, EndDate, Price, Capacity, TripDescription? }, destinations: ["Playa"] }.
- Editar viaje: PUT /api/trips/:id con campos modificados directamente; destinations es opcional. No enviar OpenPositions ni TripStatus.
- Capacity es total; OpenPositions es disponibilidad. Reducir capacidad por debajo de ocupación o cambiar fechas con reservas devuelve 409.
- DELETE /api/trips/:id archiva y conserva reservas. POST /api/trips/:id/cancel con { reason } cancela el viaje y todas sus reservas.
- Ofertas: IdTrip, OfertDescription?, Discount, StartDate, EndDate. PUT reemplaza esos campos; no acepta name/price.
- Descuento porcentual: se aplica la mayor oferta vigente, sin acumulación. El precio confirmado siempre lo devuelve el servidor.
- Criterio: no editar la disponibilidad directamente ni presentar archivar como cancelar reservas.

## F06. Confirmar y consultar reservas
POST /api/reservations:
~~~json
{ "IdTrip": 12, "personIds": [5, 8] }
~~~
- Eliminar IdUser, TotalPrice, fechas y ReservationStatus de la solicitud.
- Cada persona consume un cupo y paga la misma tarifa. El servidor comprueba disponibilidad al confirmar.
- Deshabilitar el botón mientras la solicitud está en curso. Ante un error de red, consultar mis reservas antes de reintentar; todavía no hay clave de idempotencia.
- Confirmación devuelve IdReservation, UnitPrice, Discount, TotalPrice y Passengers con datos históricos.
- GET /api/reservations/mine sustituye la consulta por ID de usuario.
- GET /api/reservations/:id devuelve una reserva concreta con Trip y Passengers.
- Admin: GET /api/trips/:id/reservations, paginado.
- 409 NO_CAPACITY: refrescar disponibilidad; PASSENGER_ALREADY_BOOKED: indicar pasajero ya reservado.
- Criterio: el frontend nunca decide el precio ni interpreta /:id como un usuario.

## F07. Cancelaciones
- POST /api/reservations/:id/cancel con {} para cliente, { reason: "Motivo" } para administrador.
- ReservationStatus true = confirmada; false = cancelada. Mostrar CancelledAt y CancellationReason si existen.
- Clientes cancelan antes de las 00:00 de StartDate, zona America/Santo_Domingo.
- Repetir cancelación es seguro. No usar DELETE ni PUT para cambiar estado o pasajeros.
- Para cambiar personas o viaje: cancelar y crear otra reserva; volver a confirmar disponibilidad y tarifa.
- Criterio: una cancelación actualiza estado y cupos sin duplicar devoluciones.

## F08. Imágenes
- Admin: POST /api/images/upload multipart con IdTrip y images (repetido por archivo).
- No establecer Content-Type manualmente: el navegador genera el separador multipart.
- Máximo 10 archivos, 5 MB cada uno; JPEG, PNG o WebP. No SVG.
- La respuesta devuelve array dentro de data; ImgURL es /uploads/nombre.ext, relativo al servidor.
- DELETE /api/images/:id elimina la imagen y sus relaciones.
- Criterio: miniaturas usan la URL correcta y muestran errores de tipo/tamaño.

## Orden para el proyecto del frontend
1. Cliente HTTP y sesión.
2. Registro y permisos.
3. Respuestas y paginación.
4. Personas, selección y reservas.
5. Cancelaciones y administración.
6. Imágenes y recorrido completo.

Consultar también /api-docs. No activar esta API frente al frontend anterior sin completar estos ajustes.
