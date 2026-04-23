const mongoose = require('mongoose');

// Un singur document "activ" — upsert pe ziua curentă
const meniuZileiSchema = new mongoose.Schema({
  ziua:  { type: String, required: true },   // ex: "2025-07-10"
  fel1:  {
    nume: { type: String, default: '' },
    desc: { type: String, default: '' },
  },
  fel2:  {
    nume: { type: String, default: '' },
    desc: { type: String, default: '' },
  },
  pret:   { type: Number,  default: 35 },
  activ:  { type: Boolean, default: true },
  inchis: { type: Boolean, default: false },  // restaurantul e închis în acea zi
}, { timestamps: true });

module.exports = mongoose.model('MeniuZilei', meniuZileiSchema);
