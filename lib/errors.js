class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
const notFound = () => new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.');
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
module.exports = { AppError, notFound, asyncHandler };
