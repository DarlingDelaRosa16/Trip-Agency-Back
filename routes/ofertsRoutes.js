module.exports = require('./catalogRouter')({
  modelName: 'Ofert', key: 'IdOfert', schema: require('../middleware/validation').offer, include: ['Trip']
});
