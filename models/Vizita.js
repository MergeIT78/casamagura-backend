const mongoose = require('mongoose');

const vizitaSchema = new mongoose.Schema({
  pagina:  { type: String, required: true, maxlength: 200 },
  device:  { type: String, enum: ['mobile', 'desktop', 'tablet'], default: 'desktop' },
  ua:      { type: String, maxlength: 300 },   // user-agent (primele 300 chars)
}, { timestamps: true });

// TTL index: șterge automat vizitele mai vechi de 90 zile
vizitaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('Vizita', vizitaSchema);
