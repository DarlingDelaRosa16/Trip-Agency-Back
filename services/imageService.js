const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { AppError } = require('../lib/errors');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
function extension(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 &&
      buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217) return 'jpg';
  if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new AppError(422, 'INVALID_IMAGE', 'Solo se permiten imágenes JPEG, PNG y WebP.');
}
async function normalize(buffer) {
  const format = extension(buffer);
  try {
    const image = sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if ((metadata.pages || 1) > 1) throw new Error('Animated image');
    return { buffer: await image.rotate().toBuffer(), format };
  } catch {
    throw new AppError(422, 'INVALID_IMAGE', 'La imagen está dañada, es animada o supera 25 millones de píxeles.');
  }
}
async function save(file) {
  const image = await normalize(file.buffer);
  const name = randomUUID() + '.' + image.format;
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(path.join(uploadDirectory, name), image.buffer, { flag: 'wx' });
  return '/uploads/' + name;
}
async function remove(url) {
  const name = path.basename(url);
  if (url !== '/uploads/' + name || name === 'placeholder.png') return;
  await fs.unlink(path.join(uploadDirectory, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
module.exports = { extension, normalize, save, remove };
