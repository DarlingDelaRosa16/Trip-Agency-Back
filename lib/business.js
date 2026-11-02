const { AppError } = require('./errors');
function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [values.year, values.month, values.day].join('-');
}
function cents(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}
function reservationPrice(price, discount, passengers) {
  const unitCents = Math.round(cents(price) * (10000 - cents(discount)) / 10000);
  const totalCents = unitCents * passengers;
  if (totalCents > 9999999999) throw new AppError(422, 'TOTAL_TOO_LARGE', 'El importe supera el límite permitido.');
  return { UnitPrice: (unitCents / 100).toFixed(2), TotalPrice: (totalCents / 100).toFixed(2) };
}
module.exports = { businessDate, reservationPrice };
