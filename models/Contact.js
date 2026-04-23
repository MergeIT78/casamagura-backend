const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  nume:          { type: String, required: true, trim: true, maxlength: 100 },
  telefon:       { type: String, required: true, trim: true, maxlength: 30 },
  mesaj:         { type: String, required: true, trim: true, maxlength: 1000 },
  dataRezervare: { type: String, trim: true },   // string liber, optional
  citit:         { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
