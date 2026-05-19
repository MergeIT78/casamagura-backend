/**
 * API Fiscalizare — polling pentru programul de casă
 *
 * Autentificare: header  X-Fiscal-Key: <valoare din env FISCAL_KEY>
 *
 * Endpoints:
 *   GET  /api/fiscal/ping           — test conexiune
 *   GET  /api/fiscal/comenzi-noi    — comenzi nefiscalizate (XML sau JSON)
 *   POST /api/fiscal/confirma/:id   — marchează comanda ca fiscalizată
 */

const router  = require('express').Router();
const Comanda = require('../models/Comanda');

// ── Middleware autentificare fiscal ──────────────────────────────────────────
function fiscalAuth(req, res, next) {
  const KEY = process.env.FISCAL_KEY;
  if (!KEY) {
    return res.status(503).type('text/plain').send('FISCAL_KEY not set on server.');
  }
  const provided = req.headers['x-fiscal-key'];
  if (!provided || provided !== KEY) {
    console.warn(`⚠️  Fiscal API: cheie invalidă de la ${req.ip}`);
    return res.status(401).type('text/plain').send('Unauthorized: X-Fiscal-Key invalid.');
  }
  next();
}

// ── Escape XML ───────────────────────────────────────────────────────────────
function x(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Builder XML ──────────────────────────────────────────────────────────────
function toXML(comenzi) {
  const items = comenzi.map(c => {
    const produse = c.produse.map(p => `
      <Produs>
        <Nume>${x(p.nume)}</Nume>
        <Cantitate>${p.cantitate}</Cantitate>
        <PretUnitar>${p.pret.toFixed(2)}</PretUnitar>
        <Total>${(p.pret * p.cantitate).toFixed(2)}</Total>
        <CotaTVA>9</CotaTVA>
      </Produs>`).join('');

    const metodaLabel = {
      'cash':        'NUMERAR',
      'card':        'CARD',
      'card-online': 'CARD_ONLINE',
    }[c.metodaPlata] || c.metodaPlata.toUpperCase();

    return `
  <Comanda>
    <Id>${c._id}</Id>
    <Numar>${c.numar}</Numar>
    <Data>${c.createdAt.toISOString()}</Data>
    <Tip>${c.tip.toUpperCase()}</Tip>
    <Client>
      <Nume>${x(c.client.nume)}</Nume>
      <Telefon>${x(c.client.telefon)}</Telefon>
      <Adresa>${x(c.client.adresa)}</Adresa>
      <Email>${x(c.client.email)}</Email>
    </Client>
    <Produse count="${c.produse.length}">${produse}
    </Produse>
    <Plata>
      <Metoda>${metodaLabel}</Metoda>
      <Platita>${c.platita ? 'true' : 'false'}</Platita>${c.stripePaymentId ? `\n      <StripeId>${c.stripePaymentId}</StripeId>` : ''}
    </Plata>
    <Total>${c.total.toFixed(2)}</Total>
    <Observatii>${x(c.observatii)}</Observatii>
  </Comanda>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Comenzi xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         count="${comenzi.length}"
         generatLa="${new Date().toISOString()}">
${items}
</Comenzi>`;
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/fiscal/ping  —  test conexiune + validare cheie
// ────────────────────────────────────────────────────────────────────────────
router.get('/ping', fiscalAuth, (_req, res) => {
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Ping status="ok" ts="${new Date().toISOString()}" server="Magura-Backend"/>`
  );
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/fiscal/comenzi-noi  —  comenzi nefiscalizate (polling)
//
// Query params:
//   ?format=xml   (implicit) — răspuns XML
//   ?format=json             — răspuns JSON
//   ?limit=50                — maxim înregistrări (default 50)
// ────────────────────────────────────────────────────────────────────────────
router.get('/comenzi-noi', fiscalAuth, async (req, res) => {
  try {
    const limit   = Math.min(Number(req.query.limit) || 50, 100);
    const format  = req.query.format || 'xml';

    const comenzi = await Comanda.find({
      fiscalizat: false,
      status:     { $nin: ['anulata'] },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    console.log(`📠 Fiscal polling: ${comenzi.length} comenzi nefiscalizate`);

    if (format === 'json') {
      return res.json({ count: comenzi.length, comenzi });
    }

    res.type('application/xml; charset=utf-8').send(toXML(comenzi));
  } catch (err) {
    console.error('Fiscal error:', err.message);
    res.status(500).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Error>${x(err.message)}</Error>`
    );
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/fiscal/confirma/:id  —  marchează comanda ca fiscalizată
//
// Body (opțional, JSON):  { "bonNumar": "001234", "casaId": "casa-1" }
// ────────────────────────────────────────────────────────────────────────────
router.post('/confirma/:id', fiscalAuth, async (req, res) => {
  try {
    const comanda = await Comanda.findByIdAndUpdate(
      req.params.id,
      { fiscalizat: true, fiscalizatAt: new Date() },
      { new: true }
    );

    if (!comanda) {
      return res.status(404).type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Error>Comanda ${req.params.id} nu exista.</Error>`
      );
    }

    console.log(`✅ Fiscal confirmat: comanda #${comanda.numar} (${comanda._id})`);

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Confirmare status="ok" comandaId="${comanda._id}" numar="${comanda.numar}" ts="${new Date().toISOString()}"/>`
    );
  } catch (err) {
    console.error('Fiscal confirmare error:', err.message);
    res.status(500).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Error>${x(err.message)}</Error>`
    );
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/fiscal/confirma-bulk  —  marchează mai multe comenzi dintr-o dată
//
// Body JSON:  { "ids": ["id1", "id2", ...] }
// ────────────────────────────────────────────────────────────────────────────
router.post('/confirma-bulk', fiscalAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Error>ids array gol sau lipsa.</Error>`
      );
    }

    const result = await Comanda.updateMany(
      { _id: { $in: ids } },
      { fiscalizat: true, fiscalizatAt: new Date() }
    );

    console.log(`✅ Fiscal bulk: ${result.modifiedCount} comenzi confirmate`);

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<ConfirmareBulk status="ok" confirmate="${result.modifiedCount}" ts="${new Date().toISOString()}"/>`
    );
  } catch (err) {
    res.status(500).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Error>${x(err.message)}</Error>`
    );
  }
});

module.exports = router;
