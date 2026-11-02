const db = require('../models');
const images = require('../services/imageService');
const reservations = require('../services/reservationService');
const { z } = require('zod');
const { parse, id } = require('../middleware/validation');
const { AppError, notFound } = require('../lib/errors');

exports.upload = async (req, res) => {
  const { IdTrip } = parse(z.object({ IdTrip: id }).strict(), req.body);
  if (!req.files?.length) throw new AppError(422, 'IMAGES_REQUIRED', 'Selecciona al menos una imagen.');
  req.files.forEach(file => images.extension(file.buffer));
  const paths = [];
  try {
    const result = await reservations.run(async transaction => {
      await reservations.lockTrip(IdTrip, transaction);
      for (const file of req.files) paths.push(await images.save(file));
      const records = await db.Img.bulkCreate(paths.map(ImgURL => ({ ImgURL, IdTrip })), { transaction });
      await db.AuditLog.create({ IdUser: req.user.IdUser, Action: 'images.upload', Entity: 'Trip', EntityId: IdTrip }, { transaction });
      return records;
    });
    res.formatResponse(result, 201);
  } catch (error) {
    await Promise.all(paths.map(url => images.remove(url).catch(() => console.error('No se pudo limpiar un archivo de imagen.'))));
    throw error;
  }
};
exports.remove = async (req, res) => {
  const image = await db.Img.findByPk(req.params.id);
  if (!image) throw notFound();
  await reservations.run(async transaction => {
    await reservations.lockTrip(image.IdTrip, transaction);
    const current = await db.Img.findByPk(req.params.id, { transaction });
    if (!current) throw notFound();
    await db.TripImageDestiny.destroy({ where: { IdImg: current.IdImg }, transaction });
    await current.destroy({ transaction });
    await db.AuditLog.create({ IdUser: req.user.IdUser, Action: 'images.delete', Entity: 'Img', EntityId: req.params.id }, { transaction });
  });
  await images.remove(image.ImgURL);
  res.formatResponse(null);
};
