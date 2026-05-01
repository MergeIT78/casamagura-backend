const { Schema, model } = require('mongoose');

const categorieSchema = new Schema({
  nume:    { type: String, required: true, trim: true },
  slug:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  ordine:  { type: Number, default: 0 },
  activa:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model('Categorie', categorieSchema);
