const router  = require('express').Router();
const Comanda = require('../models/Comanda');
const authMiddleware = require('../middleware/auth');

// ── SSE — trimite comenzi noi în timp real către admin/KDS ──
const clients = new Set();

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(msg));
}

router.get('/stream', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('data: {"type":"connected"}\n\n');
  clients.add(res);

  req.on('close', () => clients.delete(res));
});

// GET comenzi (admin) — cu filtre opționale
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const comenzi = await Comanda.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Comanda.countDocuments(filter);
    res.json({ comenzi, total, page: Number(page) });
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// GET o comandă (admin)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const comanda = await Comanda.findById(req.params.id);
    if (!comanda) return res.status(404).json({ error: 'Comandă negăsită' });
    res.json(comanda);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// POST — comandă nouă (public)
router.post('/', async (req, res) => {
  try {
    const { client, tip, produse, metodaPlata, observatii } = req.body;

    if (!client?.nume || !client?.telefon) return res.status(400).json({ error: 'Nume și telefon obligatorii' });
    if (!produse?.length) return res.status(400).json({ error: 'Coșul este gol' });
    if (tip === 'livrare' && !client?.adresa) return res.status(400).json({ error: 'Adresa de livrare este obligatorie' });

    const total = produse.reduce((sum, p) => sum + p.pret * p.cantitate, 0);
    const comanda = await Comanda.create({ client, tip, produse, total, metodaPlata, observatii });

    // Notifică admin + KDS în timp real
    broadcast({ type: 'comanda-noua', comanda });

    res.status(201).json({ ok: true, numar: comanda.numar, id: comanda._id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PATCH — update status (admin)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['noua', 'in-pregatire', 'gata', 'livrata', 'anulata'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status invalid' });

    const comanda = await Comanda.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!comanda) return res.status(404).json({ error: 'Comandă negăsită' });

    // Notifică toți clienții SSE despre schimbarea de status
    broadcast({ type: 'status-update', id: comanda._id, numar: comanda.numar, status });

    res.json(comanda);
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

// DELETE — ștergere comandă (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Comanda.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Eroare server' }); }
});

module.exports = router;
