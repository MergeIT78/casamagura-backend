const router  = require('express').Router();
const Produs  = require('../models/Produs');
const authMiddleware = require('../middleware/auth');

// GET public — produse disponibile (opțional filtrate pe categorie)
router.get('/', async (req, res) => {
  try {
    const filter = { disponibil: true };
    if (req.query.categorie) filter.categorie = req.query.categorie;
    const produse = await Produs.find(filter)
      .populate('categorie', 'nume slug')
      .sort({ ordine: 1, nume: 1 });
    res.json(produse);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// GET toate (admin)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.categorie) filter.categorie = req.query.categorie;
    const produse = await Produs.find(filter)
      .populate('categorie', 'nume slug')
      .sort({ ordine: 1, nume: 1 });
    res.json(produse);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// POST — creare produs (admin)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { categorie, nume, descriere, pret, imagine, disponibil, ordine, alergeni, gramaj } = req.body;
    if (!categorie || !nume || pret == null) return res.status(400).json({ error: 'Categorie, nume și preț obligatorii' });
    const produs = await Produs.create({ categorie, nume, descriere, pret, imagine, disponibil, ordine, alergeni, gramaj });
    res.status(201).json(produs);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// PUT — editare produs (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const produs = await Produs.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!produs) return res.status(404).json({ error: 'Produs negăsit' });
    res.json(produs);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// DELETE — ștergere produs (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Produs.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

module.exports = router;
