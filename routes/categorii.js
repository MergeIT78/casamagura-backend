const router     = require('express').Router();
const Categorie  = require('../models/Categorie');
const authMiddleware = require('../middleware/auth');

// GET public — lista categorii active
router.get('/', async (req, res) => {
  try {
    const cats = await Categorie.find({ activa: true }).sort({ ordine: 1, nume: 1 });
    res.json(cats);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// GET toate (admin)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const cats = await Categorie.find().sort({ ordine: 1, nume: 1 });
    res.json(cats);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// POST — creare categorie (admin)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { nume, slug, ordine, activa } = req.body;
    if (!nume || !slug) return res.status(400).json({ error: 'Nume și slug obligatorii' });
    const cat = await Categorie.create({ nume, slug, ordine, activa });
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug-ul există deja' });
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PUT — editare categorie (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const cat = await Categorie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cat) return res.status(404).json({ error: 'Categorie negăsită' });
    res.json(cat);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// DELETE — ștergere categorie (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Categorie.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

module.exports = router;
