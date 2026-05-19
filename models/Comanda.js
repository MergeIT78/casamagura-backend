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
    email:   { type: String, default: '', trim: true },  // optional, pentru confirmare
  },

  tip:           { type: String, enum: ['ridicare', 'livrare'], default: 'ridicare' },
  produse:       [itemSchema],
  total:         { type: Number, required: true },
  metodaPlata:   { type: String, enum: ['cash', 'card', 'card-online'], default: 'cash' },
  observatii:    { type: String, default: '', trim: true },

  status: {
    type: String,
    enum: ['noua', 'in-pregatire', 'gata', 'livrata', 'anulata'],
    default: 'noua',
  },

  stripePaymentId: { type: String, default: '' },
  platita:         { type: Boolean, default: false },
  refundat:        { type: Boolean, default: false },
  refundId:        { type: String,  default: '' },
  refundMotiv:     { type: String,  default: '' },
  refundAt:        { type: Date,    default: null },

  // Fiscalizare — marcat după ce programul de casă bate bonul
  fiscalizat:      { type: Boolean, default: false },
  fiscalizatAt:    { type: Date,    default: null },

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
