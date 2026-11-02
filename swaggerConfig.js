const { z } = require('zod');
const v = require('./middleware/validation');

const jsonSchema = schema => {
  const value = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  delete value.$schema;
  return value;
};
const spec = {
  openapi: '3.1.0',
  info: { title: 'TripAgency API', version: '2.0.0', description: 'Sesiones con cookies. Obtén CSRF en /api/user/csrf y envíalo en X-CSRF-Token para modificar datos.' },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'tripagency.sid' } },
    schemas: {
      Register: jsonSchema(v.register), Login: jsonSchema(v.login), Person: jsonSchema(v.person),
      CreateTrip: jsonSchema(v.createTrip), UpdateTrip: jsonSchema(v.updateTrip), Offer: jsonSchema(v.offer),
      CreateReservation: jsonSchema(v.reservation), Cancellation: jsonSchema(v.cancellation),
      ChangePassword: jsonSchema(v.changePassword), Destiny: jsonSchema(v.destiny), TripImage: jsonSchema(v.tripImage),
      Envelope: { type: 'object', required: ['data', 'message', 'status', 'error'], properties: {
        data: {}, message: { type: 'string' }, status: { type: 'integer' }, error: { type: ['object', 'null'] }
      } }
    }
  },
  paths: {}
};
function operation(path, method, summary, schema, access = 'session', list = false) {
  const parameters = [];
  if (path.includes('{id}')) parameters.push({ in: 'path', name: 'id', required: true, schema: { type: 'integer', minimum: 1 } });
  if (list) parameters.push(
    { in: 'query', name: 'page', schema: { type: 'integer', default: 1, minimum: 1, maximum: 1000000 } },
    { in: 'query', name: 'pageSize', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 } }
  );
  if (!['get', 'head'].includes(method)) parameters.push({ in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' } });
  const content = { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } };
  const definition = {
    summary, description: access === 'admin' ? 'Solo administradores.' : access === 'public' ? 'Acceso público.' : 'Requiere sesión. Recursos limitados al propietario o administrador.',
    security: access === 'public' ? [] : [{ session: [] }], parameters,
    responses: {
      [method === 'post' && !path.includes('login') && !path.includes('logout') && !path.includes('cancel') && !path.includes('password') ? '201' : '200']: { description: list ? 'data: { items, total, page, pageSize }' : 'Operación completada.', content },
      '401': { description: 'Sesión requerida.', content }, '403': { description: 'Permisos insuficientes o CSRF inválido.', content },
      '404': { description: 'Recurso no encontrado.', content }, '409': { description: 'Conflicto de disponibilidad o integridad.', content },
      '422': { description: 'Datos inválidos; error.details contiene campos afectados.', content },
      '429': { description: 'Demasiadas solicitudes.', content }
    }
  };
  if (schema) definition.requestBody = { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + schema } } } };
  (spec.paths[path] ||= {})[method] = definition;
}
operation('/api/user/csrf', 'get', 'Obtener token CSRF', null, 'public');
operation('/api/user/create', 'post', 'Registrar cliente', 'Register', 'public');
operation('/api/user/login', 'post', 'Iniciar sesión', 'Login', 'public');
operation('/api/user/me', 'get', 'Usuario actual');
operation('/api/user/logout', 'post', 'Cerrar sesión');
operation('/api/user/change-password', 'post', 'Cambiar contraseña e invalidar sesiones', 'ChangePassword');
for (const [path, schema] of [['person', 'Person'], ['oferts', 'Offer'], ['destinies', 'Destiny'], ['tripImageDestinies', 'TripImage']]) {
  const access = path === 'person' ? 'session' : 'admin';
  const read = path === 'person' ? 'session' : 'public';
  operation('/api/' + path, 'get', 'Listar ' + path, null, read, true);
  operation('/api/' + path + '/{id}', 'get', 'Consultar ' + path, null, read);
  operation('/api/' + path, 'post', 'Crear ' + path, schema, access);
  operation('/api/' + path + '/{id}', 'put', 'Reemplazar campos editables de ' + path, schema, access);
  operation('/api/' + path + '/{id}', 'delete', 'Eliminar ' + path, null, access);
}
operation('/api/trips', 'get', 'Listar viajes con destinos, imágenes, ofertas y OpenPositions calculado', null, 'public', true);
operation('/api/trips/{id}', 'get', 'Consultar viaje', null, 'public');
operation('/api/trips', 'post', 'Crear viaje y destinos', 'CreateTrip', 'admin');
operation('/api/trips/{id}', 'put', 'Actualizar viaje; las fechas quedan protegidas si hay reservas', 'UpdateTrip', 'admin');
operation('/api/trips/{id}', 'delete', 'Archivar viaje sin eliminar reservas', null, 'admin');
operation('/api/trips/{id}/cancel', 'post', 'Cancelar viaje y reservas; requiere reason', 'Cancellation', 'admin');
operation('/api/trips/{id}/reservations', 'get', 'Reservas del viaje', null, 'admin', true);
operation('/api/reservations/mine', 'get', 'Mis reservas', null, 'session', true);
operation('/api/reservations/{id}', 'get', 'Reserva con pasajeros históricos');
operation('/api/reservations', 'post', 'Reservar pasajeros propios; precio calculado en servidor', 'CreateReservation');
operation('/api/reservations/{id}/cancel', 'post', 'Cancelar reserva; admin debe proporcionar reason', 'Cancellation');
operation('/api/roles', 'get', 'Roles disponibles', null, 'admin');
operation('/api/images/upload', 'post', 'Subir hasta 10 imágenes de 5 MB', null, 'admin');
spec.paths['/api/images/upload'].post.requestBody = { required: true, content: { 'multipart/form-data': {
  schema: { type: 'object', required: ['IdTrip', 'images'], properties: {
    IdTrip: { type: 'integer', minimum: 1 }, images: { type: 'array', maxItems: 10, items: { type: 'string', format: 'binary' } }
  } }
} } };
operation('/api/images/{id}', 'delete', 'Eliminar imagen y sus relaciones', null, 'admin');
module.exports = spec;
