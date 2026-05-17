const router        = require('express').Router();
const authMiddleware = require('../middleware/auth');
const Comanda        = require('../models/Comanda');

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

function noStripe(res) {
  return res.status(503).json({ error: 'Stripe nu este configurat pe acest server.' });
}

// ── Ajutor timp ────────────────────────────────────────────────────────────
function startOf(unit) {
  const d = new Date();
  if (unit === 'today') { d.setHours(0, 0, 0, 0); }
  if (unit === 'week')  { d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); }
  if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
  return Math.floor(d.getTime() / 1000);
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/stripe/stats  —  sold + venituri azi / săptămână / lună
// ──────────────────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
  if (!stripe) return noStripe(res);
  try {
    // Fetch în paralel: sold + ultimele 100 tranzacții (ajunge pentru stats)
    const [balance, intents] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.paymentIntents.list({ limit: 100 }),
    ]);

    const succeeded = intents.data.filter(pi => pi.status === 'succeeded');

    const calc = (fromTs) => {
      const slice = succeeded.filter(pi => pi.created >= fromTs);
      return {
        count:   slice.length,
        total:   slice.reduce((s, pi) => s + pi.amount, 0) / 100,  // bani → RON
      };
    };

    res.json({
      balance: {
        disponibil: balance.available.reduce((s, b) => s + b.amount, 0) / 100,
        asteptare:  balance.pending.reduce((s, b) => s + b.amount, 0)   / 100,
      },
      azi:       calc(startOf('today')),
      saptamana: calc(startOf('week')),
      luna:      calc(startOf('month')),
      total:     calc(0),
    });
  } catch (err) {
    console.error('Stripe stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/stripe/tranzactii  —  lista tranzacții cu info din Comanda noastră
// ──────────────────────────────────────────────────────────────────────────
router.get('/tranzactii', authMiddleware, async (req, res) => {
  if (!stripe) return noStripe(res);
  try {
    const limit         = Math.min(Number(req.query.limit) || 50, 100);
    const startingAfter = req.query.starting_after || undefined;

    const params = { limit, expand: ['data.latest_charge'] };
    if (startingAfter) params.starting_after = startingAfter;

    const intents = await stripe.paymentIntents.list(params);

    // Cross-reference cu comenzile noastre pentru nume client + număr
    const ids     = intents.data.map(pi => pi.id).filter(Boolean);
    const comenzi = await Comanda.find(
      { stripePaymentId: { $in: ids } },
      'numar client.nume stripePaymentId refundat refundId refundMotiv refundAt'
    ).lean();

    const cmdMap = {};
    comenzi.forEach(c => { cmdMap[c.stripePaymentId] = c; });

    const tranzactii = intents.data.map(pi => ({
      id:        pi.id,
      amount:    pi.amount / 100,
      currency:  (pi.currency || 'ron').toUpperCase(),
      status:    pi.status,
      created:   pi.created,
      refundSum: (pi.latest_charge?.amount_refunded || 0) / 100,
      comanda:   cmdMap[pi.id] || null,
    }));

    res.json({ tranzactii, hasMore: intents.has_more });
  } catch (err) {
    console.error('Stripe tranzactii error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/stripe/refund  —  rambursare (necesită parolă manager)
//
// SECURITATE:
//  • Ruta e în spate de authMiddleware (JWT valid obligatoriu)
//  • Parola manager e verificată SERVER-SIDE față de env MANAGER_PASSWORD
//  • Cheia Stripe nu iese niciodată din backend
//  • Fiecare refund e logat cu emailul adminului + timestamp
// ──────────────────────────────────────────────────────────────────────────
router.post('/refund', authMiddleware, async (req, res) => {
  if (!stripe) return noStripe(res);

  const { paymentIntentId, managerPassword, motiv } = req.body;

  // ── 1. Verifică parola manager ──────────────────────────────────────────
  const MANAGER_PASS = process.env.MANAGER_PASSWORD;
  if (!MANAGER_PASS) {
    return res.status(503).json({ error: 'MANAGER_PASSWORD nu este setat pe server.' });
  }
  if (!managerPassword || managerPassword !== MANAGER_PASS) {
    console.warn(`⚠️  Tentativă refund eșuată — parolă greșită (admin: ${req.user?.email})`);
    return res.status(403).json({ error: 'Parolă manager incorectă.' });
  }

  // ── 2. Validare input ───────────────────────────────────────────────────
  if (!paymentIntentId) return res.status(400).json({ error: 'ID tranzacție lipsă.' });

  try {
    // ── 3. Verifică că PI există și e succeeded ─────────────────────────
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: `Nu se poate rambursa — status: ${pi.status}` });
    }
    if (pi.latest_charge && pi.latest_charge.amount_refunded > 0) {
      return res.status(400).json({ error: 'Această tranzacție a fost deja rambursată.' });
    }

    // ── 4. Creează refund la Stripe ─────────────────────────────────────
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason:         'requested_by_customer',
      metadata: {
        motiv:    motiv || 'fără motiv specificat',
        admin:    req.user.email,
        refundAt: new Date().toISOString(),
      },
    });

    // ── 5. Actualizează comanda noastră ─────────────────────────────────
    await Comanda.findOneAndUpdate(
      { stripePaymentId: paymentIntentId },
      {
        refundat:    true,
        refundId:    refund.id,
        refundMotiv: motiv || '',
        refundAt:    new Date(),
      }
    );

    console.log(`💸 Refund ${refund.id} — ${pi.amount/100} RON — admin: ${req.user.email} — motiv: ${motiv}`);

    res.json({ ok: true, refundId: refund.id, suma: pi.amount / 100 });
  } catch (err) {
    console.error('Stripe refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
