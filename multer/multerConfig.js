const multer = require('multer');
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 1, parts: 11, fieldSize: 32 }
}).array('images', 10);
