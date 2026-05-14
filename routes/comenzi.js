const router  = require('express').Router();
const Comanda = require('../models/Comanda');
const authMiddleware = require('../middleware/auth');
const { notificaRestaurant, confirmareClient } = require('../services/email');

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

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

// POST /api/comenzi/payment-intent — creaza PaymentIntent Stripe (public)
router.post('/payment-intent', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Plata online indisponibilă momentan' });
  try {
    const { total } = req.body;
    if (!total || total < 1) return res.status(400).json({ error: 'Total invalid' });

    const pi = await stripe.paymentIntents.create({
      amount:   Math.round(total * 100), // RON → bani
      currency: 'ron',
      description: 'Comanda Restaurant Magura',
      metadata: { sursa: 'comanda-online' },
    });

    res.json({ clientSecret: pi.client_secret });
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err.message);
    res.status(500).json({ error: 'Eroare procesare plată' });
  }
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
    const { client, tip, produse, metodaPlata, observatii, stripePaymentIntentId } = req.body;

    if (!client?.nume || !client?.telefon) return res.status(400).json({ error: 'Nume și telefon obligatorii' });
    if (!produse?.length) return res.status(400).json({ error: 'Coșul este gol' });
    if (tip === 'livrare' && !client?.adresa) return res.status(400).json({ error: 'Adresa de livrare este obligatorie' });

    // Verifica plata Stripe daca metoda e card-online
    let platita = false;
    let stripeId = '';
    if (metodaPlata === 'card-online') {
      if (!stripe)                  return res.status(503).json({ error: 'Plata online indisponibilă' });
      if (!stripePaymentIntentId)   return res.status(400).json({ error: 'ID plată lipsă' });
      const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
      if (pi.status !== 'succeeded') return res.status(400).json({ error: 'Plata nu a fost confirmată' });
      platita  = true;
      stripeId = stripePaymentIntentId;
    }

    const total = produse.reduce((sum, p) => sum + p.pret * p.cantitate, 0);
    const comanda = await Comanda.create({
      client, tip, produse, total, metodaPlata, observatii,
      platita, stripePaymentId: stripeId,
    });

    // Notifică admin + KDS în timp real (SSE)
    broadcast({ type: 'comanda-noua', comanda });

    // Trimite emailuri asincron — nu blocheaza raspunsul
    notificaRestaurant(comanda).catch(() => {});
    confirmareClient(comanda).catch(() => {});

    res.status(201).json({ ok: true, numar: comanda.numar, id: comanda._id });
  } catch (err) {
    console.error('Comanda error:', err.message);
    // Returnam detalii de validare Mongoose in dev, mesaj generic in prod
    const isValidation = err.name === 'ValidationError';
    res.status(500).json({
      error: isValidation ? `Date invalide: ${err.message}` : 'Eroare server',
    });
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
