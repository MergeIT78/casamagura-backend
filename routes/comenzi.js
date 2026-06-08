const router  = require('express').Router();
const Comanda = require('../models/Comanda');
const Produs  = require('../models/Produs');
const authMiddleware = require('../middleware/auth');
const { notificaRestaurant, confirmareClient } = require('../services/email');

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// SECURITATE: construiește lista de produse + total EXCLUSIV din baza de date.
// Clientul trimite doar { produsId, cantitate }. Prețul, numele și idmat-ul
// (ID-ul de casă de marcat) sunt luate din DB — clientul NU poate influența
// prețul. Returnează { items, total } sau aruncă Error cu mesaj prietenos.
// ─────────────────────────────────────────────────────────────────────────────
async function construiesteComanda(produseInput) {
  if (!Array.isArray(produseInput) || produseInput.length === 0) {
    const e = new Error('Coșul este gol'); e.status = 400; throw e;
  }

  // Agregă cantitățile pe produsId (apără-te de linii duplicate)
  const cantitati = new Map();
  for (const p of produseInput) {
    const id  = p?.produsId;
    const qty = Math.floor(Number(p?.cantitate));
    if (!id)                 { const e = new Error('Produs invalid în coș');    e.status = 400; throw e; }
    if (!qty || qty < 1)     { const e = new Error('Cantitate invalidă în coș'); e.status = 400; throw e; }
    if (qty > 99)            { const e = new Error('Cantitate prea mare');       e.status = 400; throw e; }
    cantitati.set(String(id), (cantitati.get(String(id)) || 0) + qty);
  }

  const ids = [...cantitati.keys()];
  let produseDb;
  try {
    produseDb = await Produs.find({ _id: { $in: ids } });
  } catch {
    const e = new Error('Produs invalid în coș'); e.status = 400; throw e;
  }
  if (produseDb.length !== ids.length) {
    const e = new Error('Unul sau mai multe produse nu mai există'); e.status = 400; throw e;
  }

  const items = [];
  let total = 0;
  for (const prod of produseDb) {
    if (!prod.disponibil) {
      const e = new Error(`Produsul „${prod.nume}" nu mai este disponibil`); e.status = 409; throw e;
    }
    const qty = cantitati.get(String(prod._id));
    total += prod.pret * qty;
    items.push({
      produsId:  prod._id,
      idmat:     prod.idmat,        // ID casa de marcat — snapshot din DB
      nume:      prod.nume,         // snapshot din DB
      pret:      prod.pret,         // PREȚ DIN DB — sursă de adevăr
      cantitate: qty,
    });
  }

  // Rotunjire la 2 zecimale (evită erori de virgulă mobilă)
  total = Math.round(total * 100) / 100;
  return { items, total };
}

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
// Suma este calculată SERVER-SIDE din prețurile reale din DB, NU din client.
router.post('/payment-intent', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Plata online indisponibilă momentan' });
  try {
    const { produse } = req.body;
    const { total } = await construiesteComanda(produse);   // preț din DB
    if (total < 1) return res.status(400).json({ error: 'Total invalid' });

    const pi = await stripe.paymentIntents.create({
      amount:   Math.round(total * 100), // RON → bani
      currency: 'ron',
      description: 'Comanda Restaurant Magura',
      metadata: { sursa: 'comanda-online' },
    });

    // Întoarcem și totalul calculat de server (clientul îl poate afișa)
    res.json({ clientSecret: pi.client_secret, total });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
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
    if (tip === 'livrare' && !client?.adresa) return res.status(400).json({ error: 'Adresa de livrare este obligatorie' });

    // ── Construiește comanda din DB (preț + idmat = sursă de adevăr) ──
    const { items, total } = await construiesteComanda(produse);

    const metoda = ['cash', 'card', 'card-online'].includes(metodaPlata) ? metodaPlata : 'cash';

    // ── Verifică plata Stripe dacă metoda e card-online ──
    let platita = false;
    let stripeId = '';
    if (metoda === 'card-online') {
      if (!stripe)                  return res.status(503).json({ error: 'Plata online indisponibilă' });
      if (!stripePaymentIntentId)   return res.status(400).json({ error: 'ID plată lipsă' });

      // Anti-refolosire: același PaymentIntent nu poate fi legat de 2 comenzi
      const existent = await Comanda.findOne({ stripePaymentId: stripePaymentIntentId });
      if (existent) return res.status(409).json({ error: 'Plata a fost deja folosită pentru o comandă' });

      const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
      if (pi.status !== 'succeeded') return res.status(400).json({ error: 'Plata nu a fost confirmată' });

      // Verifică suma și moneda plătite vs. totalul calculat din DB
      if (pi.currency !== 'ron' || Math.round(pi.amount) !== Math.round(total * 100)) {
        console.warn(`⚠️  Refuz comandă: sumă plată (${pi.amount}) ≠ total DB (${Math.round(total*100)})`);
        return res.status(400).json({ error: 'Suma plătită nu corespunde comenzii' });
      }
      platita  = true;
      stripeId = stripePaymentIntentId;
    }

    const comanda = await Comanda.create({
      client, tip, produse: items, total, metodaPlata: metoda, observatii,
      platita, stripePaymentId: stripeId,
    });

    // Notifică admin + KDS în timp real (SSE)
    broadcast({ type: 'comanda-noua', comanda });

    // Trimite emailuri asincron — nu blocheaza raspunsul
    notificaRestaurant(comanda).catch(() => {});
    confirmareClient(comanda).catch(() => {});

    res.status(201).json({ ok: true, numar: comanda.numar, id: comanda._id });
  } catch (err) {
    // Erori de validare ale comenzii (preț/stoc/coș) → cod specific
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Comanda error:', err.message);
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
