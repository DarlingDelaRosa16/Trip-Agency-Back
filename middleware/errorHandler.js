const { AppError } = require('../lib/errors');
module.exports = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.name === 'SequelizeUniqueConstraintError') {
    error = new AppError(409, 'DUPLICATE', 'El registro ya existe.');
  } else if (error.name === 'SequelizeForeignKeyConstraintError') {
    error = new AppError(409, 'REFERENCED_RESOURCE', 'El registro está relacionado con otros datos.');
  } else if (error.name === 'SequelizeValidationError') {
    error = new AppError(422, 'INVALID_DATA', 'Datos inválidos.');
  } else if (error.type === 'entity.parse.failed') {
    error = new AppError(400, 'INVALID_JSON', 'El contenido JSON no es válido.');
  } else if (error.type === 'entity.too.large') {
    error = new AppError(413, 'REQUEST_TOO_LARGE', 'Solicitud demasiado grande.');
  } else if (error.name === 'MulterError') {
    error = new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'UPLOAD_LIMIT', 'Archivos demasiado grandes o no permitidos.');
  }
  const status = error.status || 500;
  if (status >= 500) console.error(JSON.stringify({ requestId: req.id, code: error.name || 'Error' }));
  return res.status(status).json({
    data: null, message: status >= 500 ? 'No se pudo completar la operación.' : error.message,
    status, error: { code: error.code || 'INTERNAL_ERROR', ...(error.details ? { details: error.details } : {}), requestId: req.id }
  });
};
