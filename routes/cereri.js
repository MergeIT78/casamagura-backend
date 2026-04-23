const router          = require('express').Router();
const CerereEveniment = require('../models/CerereEveniment');
const auth            = require('../middleware/auth');

// POST /api/cereri  — public (site)
router.post('/', async (req, res) => {
  try {
    const { nume, telefon, tipEveniment, dataEstimata, persoane, mesaj } = req.body;
    if (!nume?.trim() || !telefon?.trim()) {
      return res.status(400).json({ error: 'Nume și telefon sunt obligatorii' });
    }

    const cerere = await CerereEveniment.create({
      nume:         nume.trim().slice(0, 100),
      telefon:      telefon.trim().slice(0, 30),
      tipEveniment: tipEveniment || 'altul',
      dataEstimata: (dataEstimata || '').trim().slice(0, 100),
      persoane:     persoane ? Number(persoane) : null,
      mesaj:        (mesaj || '').trim().slice(0, 1000),
    });

    res.status(201).json({ ok: true, id: cerere._id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/cereri  — protejat (admin)
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status && status !== 'toate') filter.status = status;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(50, Number(limit));
    const lim  = Math.min(50, Number(limit));

    const [cereri, total, noi] = await Promise.all([
      CerereEveniment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim),
      CerereEveniment.countDocuments(filter),
      CerereEveniment.countDocuments({ status: 'noua' }),
    ]);

    res.json({ cereri, total, noi, pagina: Number(page), pagini: Math.ceil(total / lim) });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PATCH /api/cereri/:id  — protejat, schimbă status
router.patch('/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['noua', 'contactat', 'finalizat'].includes(status)) {
      return res.status(400).json({ error: 'Status invalid' });
    }
    const doc = await CerereEveniment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Cerere negăsită' });
    res.json(doc);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// DELETE /api/cereri/:id  — protejat
router.delete('/:id', auth, async (req, res) => {
  try {
    await CerereEveniment.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
