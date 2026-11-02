module.exports = require('./catalogRouter')({
  modelName: 'Destiny', key: 'IdDestiny', schema: require('../middleware/validation').destiny, include: ['Trip']
});
