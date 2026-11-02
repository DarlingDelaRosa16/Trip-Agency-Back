module.exports = (req, res, next) => {
  res.formatResponse = (data, status = 200, message = 'Operación realizada correctamente.') =>
    res.status(status).json({ data, message, status, error: null });
  next();
};
