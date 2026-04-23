const router    = require('express').Router();
const Rezervare = require('../models/Rezervare');
const auth      = require('../middleware/auth');

// POST /api/rezervari  — public (site)
router.post('/', async (req, res) => {
  try {
    const { nume, telefon, data, ora, persoane, observatii } = req.body;
    if (!nume?.trim() || !telefon?.trim() || !data || !ora || !persoane) {
      return res.status(400).json({ error: 'Nume, telefon, data, ora și numărul de persoane sunt obligatorii' });
    }

    const rez = await Rezervare.create({
      nume:       nume.trim().slice(0, 100),
      telefon:    telefon.trim().slice(0, 30),
      data,
      ora,
      persoane:   Number(persoane),
      observatii: (observatii || '').trim().slice(0, 500),
    });

    res.status(201).json({ ok: true, id: rez._id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/rezervari  — protejat (admin)
router.get('/', auth, async (req, res) => {
  try {
    const { status, data, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status && status !== 'toate') filter.status = status;
    if (data)   filter.data = data;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(50, Number(limit));
    const lim  = Math.min(50, Number(limit));

    const [rezervari, total, noi] = await Promise.all([
      Rezervare.find(filter).sort({ data: 1, ora: 1 }).skip(skip).limit(lim),
      Rezervare.countDocuments(filter),
      Rezervare.countDocuments({ status: 'noua' }),
    ]);

    res.json({ rezervari, total, noi, pagina: Number(page), pagini: Math.ceil(total / lim) });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/rezervari/azi  — protejat, rezervări pentru ziua de azi
router.get('/azi', auth, async (req, res) => {
  try {
    const azi = new Date().toISOString().slice(0, 10);
    const rezervari = await Rezervare.find({ data: azi }).sort({ ora: 1 });
    res.json(rezervari);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PATCH /api/rezervari/:id  — protejat, schimbă status
router.patch('/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['noua', 'confirmata', 'anulata'].includes(status)) {
      return res.status(400).json({ error: 'Status invalid' });
    }
    const doc = await Rezervare.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Rezervare negăsită' });
    res.json(doc);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// DELETE /api/rezervari/:id  — protejat
router.delete('/:id', auth, async (req, res) => {
  try {
    await Rezervare.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
