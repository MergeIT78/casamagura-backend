const { Schema, model } = require('mongoose');

const produsSchema = new Schema({
  categorie:   { type: Schema.Types.ObjectId, ref: 'Categorie', required: true },
  nume:        { type: String, required: true, trim: true },
  descriere:   { type: String, default: '', trim: true },
  pret:        { type: Number, required: true, min: 0 },
  imagine:     { type: String, default: '' },   // URL imagine (Cloudflare R2 sau base64 mic)
  disponibil:  { type: Boolean, default: true },
  ordine:      { type: Number, default: 0 },
  alergeni:    { type: String, default: '' },
  gramaj:      { type: String, default: '' },   // ex: "300g", "500ml"
}, { timestamps: true });

module.exports = model('Produs', produsSchema);
