const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { normalize } = require('../services/imageService');

test('valid images are decoded and re-encoded before storage', async () => {
  const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const normalized = await normalize(buffer);
  const metadata = await sharp(normalized.buffer).metadata();
  assert.equal(normalized.format, 'png');
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 2);
});
test('forged PNG headers cannot bypass actual image decoding', async () => {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12);
  await assert.rejects(normalize(buffer), { code: 'INVALID_IMAGE' });
});
