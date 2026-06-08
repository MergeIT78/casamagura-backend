const { Schema, model } = require('mongoose');

const categorieSchema = new Schema({
  // ID categorie din casa de marcat (idcat) — cheie stabilă, NU se modifică
  idcat:   { type: Number, unique: true, sparse: true, index: true },
  nume:    { type: String, required: true, trim: true },
  slug:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  ordine:  { type: Number, default: 0 },
  activa:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model('Categorie', categorieSchema);
