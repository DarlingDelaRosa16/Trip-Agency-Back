module.exports = require('./catalogRouter')({
  modelName: 'TripImageDestiny', key: 'IdTripImageDestiny',
  schema: require('../middleware/validation').tripImage, include: ['Trip', 'Destiny', 'Image']
});
