const { Schema, model } = require('mongoose');

const itemSchema = new Schema({
  produsId:  { type: Schema.Types.ObjectId, ref: 'Produs' },
  nume:      { type: String, required: true },   // snapshot la momentul comenzii
  pret:      { type: Number, required: true },
  cantitate: { type: Number, required: true, min: 1 },
}, { _id: false });

const comandaSchema = new Schema({
  numar: { type: Number, unique: true },   // auto-increment simplu

  client: {
    nume:    { type: String, required: true, trim: true },
    telefon: { type: String, required: true, trim: true },
    adresa:  { type: String, default: '', trim: true },
  },

  tip:           { type: String, enum: ['ridicare', 'livrare'], default: 'ridicare' },
  produse:       [itemSchema],
  total:         { type: Number, required: true },
  metodaPlata:   { type: String, enum: ['cash', 'card'], default: 'cash' },
  observatii:    { type: String, default: '', trim: true },

  status: {
    type: String,
    enum: ['noua', 'in-pregatire', 'gata', 'livrata', 'anulata'],
    default: 'noua',
  },

  // pentru Stripe — se adaugă mai târziu
  stripePaymentId: { type: String, default: '' },
  platita:         { type: Boolean, default: false },

}, { timestamps: true });

// Auto-increment număr comandă
comandaSchema.pre('save', async function (next) {
  if (this.isNew) {
    const last = await this.constructor.findOne({}, {}, { sort: { numar: -1 } });
    this.numar = last?.numar ? last.numar + 1 : 1;
  }
  next();
});

module.exports = model('Comanda', comandaSchema);
