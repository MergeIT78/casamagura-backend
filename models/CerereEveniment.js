const mongoose = require('mongoose');

const cerereSchema = new mongoose.Schema({
  nume:          { type: String, required: true, trim: true, maxlength: 100 },
  telefon:       { type: String, required: true, trim: true, maxlength: 30 },
  tipEveniment:  {
    type: String,
    enum: ['aniversare', 'corporate', 'botez', 'protocol', 'altul'],
    default: 'altul',
  },
  dataEstimata:  { type: String, trim: true, default: '' },   // text liber
  persoane:      { type: Number, min: 1, max: 500, default: null },
  mesaj:         { type: String, trim: true, maxlength: 1000, default: '' },
  status:        { type: String, enum: ['noua', 'contactat', 'finalizat'], default: 'noua' },
}, { timestamps: true });

module.exports = mongoose.model('CerereEveniment', cerereSchema);
