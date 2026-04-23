const mongoose = require('mongoose');

const rezervareSchema = new mongoose.Schema({
  nume:        { type: String, required: true, trim: true, maxlength: 100 },
  telefon:     { type: String, required: true, trim: true, maxlength: 30 },
  data:        { type: String, required: true },   // "2025-07-15"
  ora:         { type: String, required: true },   // "13:00"
  persoane:    { type: Number, required: true, min: 1, max: 200 },
  observatii:  { type: String, trim: true, maxlength: 500, default: '' },
  status:      { type: String, enum: ['noua', 'confirmata', 'anulata'], default: 'noua' },
}, { timestamps: true });

module.exports = mongoose.model('Rezervare', rezervareSchema);
