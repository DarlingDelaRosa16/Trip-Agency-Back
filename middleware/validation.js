const { z } = require('zod');
const { AppError } = require('../lib/errors');
const { businessDate } = require('../lib/business');

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, 'INVALID_DATA', 'Revisa los datos enviados.',
      result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}
const body = schema => (req, res, next) => {
  try { req.body = parse(schema, req.body); next(); } catch (error) { next(error); }
};
const id = z.coerce.number().int().positive().max(2147483647);
const params = (req, res, next) => {
  try { req.params.id = parse(id, req.params.id); next(); } catch (error) { next(error); }
};
const pagination = (req, res, next) => {
  try {
    const { page, pageSize } = parse(z.object({
      page: z.coerce.number().int().min(1).max(1000000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20)
    }).strict(), req.query);
    req.pagination = { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
    next();
  } catch (error) { next(error); }
};
const nonempty = max => z.string().trim().min(1).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value =>
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Fecha inválida.');
const password = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Máximo 72 bytes.');
const email = z.string().trim().toLowerCase().email().max(254);
const person = z.object({
  PersonName: nonempty(50), PersonLastname: nonempty(50),
  Dni: nonempty(50).nullable().optional(), BirthDate: date.refine(value => value <= businessDate(), 'La fecha de nacimiento no puede estar en el futuro.').nullable().optional(),
  Phone: nonempty(50).nullable().optional(), Email: email.nullable().optional(),
  Sex: z.enum(['M', 'F', 'O']).nullable().optional()
}).strict();
const money = z.number().finite().positive().max(99999999.99).refine(value =>
  Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Máximo dos decimales.');
const range = value => !value.StartDate || !value.EndDate || value.EndDate >= value.StartDate;
const tripFields = z.object({
  TripName: nonempty(255), StartDate: date, EndDate: date, Price: money,
  TripDescription: z.string().trim().max(10000).nullable().optional(),
  Capacity: z.number().int().min(1).max(10000), TripStatus: z.boolean().optional()
}).strict();
const offer = z.object({
  IdTrip: z.number().int().positive(), OfertDescription: z.string().trim().max(1000).nullable().optional(),
  Discount: z.number().min(0).max(100).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
  StartDate: date, EndDate: date
}).strict().refine(range, 'La fecha final debe ser igual o posterior a la inicial.');

const reservationInput = z.object({
  IdTrip: z.number().int().positive(),
  personIds: z.array(z.number().int().positive()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'No repitas pasajeros.')
}).strict();

module.exports = {
  parse, body, params, pagination, id, password, email, person, offer,
  adminReservationsQuery: (req, res, next) => {
    try {
      const query = parse(z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(['all', 'confirmed', 'cancelled']).default('all') }).strict(), req.query);
      req.reservationStatus = query.status;
      req.pagination = { page: query.page, pageSize: query.pageSize, limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
      next();
    } catch (error) { next(error); }
  },
  register: z.object({ personData: person, email, password }).strict(),
  login: z.object({ email, password: z.string().min(1).max(72) }).strict(),
  changePassword: z.object({ currentPassword: z.string().min(1).max(72), password }).strict(),
  createTrip: z.object({
    trip: tripFields.refine(range, 'Fechas inválidas.'),
    destinations: z.array(nonempty(255)).min(1).max(100)
  }).strict(),
  updateTrip: tripFields.omit({ TripStatus: true }).partial().extend({
    destinations: z.array(nonempty(255)).min(1).max(100).optional()
  }).strict().refine(value => Object.keys(value).length > 0, 'No hay cambios.').refine(range, 'Fechas inválidas.'),
  reservationQuote: reservationInput,
  reservation: reservationInput.extend({ expectedQuote: z.object({
    TotalPrice: z.string().regex(/^(?:0|[1-9]\d{0,7})\.\d{2}$/),
    StartReservationDate: date, EndReservationDate: date
  }).strict().optional() }).strict(),
  cancellation: z.object({ reason: nonempty(500).optional() }).strict(),
  destiny: z.object({ Destiny: nonempty(255), IdTrip: z.number().int().positive() }).strict(),
  tripImage: z.object({
    IdTrip: z.number().int().positive(), IdDestiny: z.number().int().positive(), IdImg: z.number().int().positive()
  }).strict()
};
