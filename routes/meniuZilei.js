const router    = require('express').Router();
const MeniuZilei = require('../models/MeniuZilei');
const auth      = require('../middleware/auth');

function astazi() {
  return new Date().toISOString().slice(0, 10);
}

// Returnează data de luni a săptămânii care conține `dateStr` (YYYY-MM-DD)
function getLuniSaptamanii(dateStr) {
  const d = new Date((dateStr || astazi()) + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0 = Duminică
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Adaugă n zile la un string YYYY-MM-DD
function addZile(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// GET /api/meniu-zilei/saptamana?luni=YYYY-MM-DD  — public
// Returnează meniurile pentru Luni–Vineri ale săptămânii indicate
router.get('/saptamana', async (req, res) => {
  try {
    const luni = getLuniSaptamanii(req.query.luni);
    const zileStr = Array.from({ length: 5 }, (_, i) => addZile(luni, i));
    const meniuri = await MeniuZilei.find({ ziua: { $in: zileStr } });
    const zile = zileStr.map(z => meniuri.find(m => m.ziua === z) || null);
    res.json({ luni, zile });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PUT /api/meniu-zilei/saptamana  — protejat, salvare în bulk Luni–Vineri
router.put('/saptamana', auth, async (req, res) => {
  try {
    const { zile } = req.body;
    if (!Array.isArray(zile) || zile.length === 0)
      return res.status(400).json({ error: 'zile[] este obligatoriu' });

    const results = await Promise.all(
      zile.map(z => MeniuZilei.findOneAndUpdate(
        { ziua: z.ziua },
        {
          ziua:   z.ziua,
          fel1:   { nume: z.fel1?.nume || '', desc: z.fel1?.desc || '' },
          fel2:   { nume: z.fel2?.nume || '', desc: z.fel2?.desc || '' },
          pret:   z.pret   ?? 35,
          activ:  z.activ  ?? true,
          inchis: z.inchis ?? false,
        },
        { upsert: true, new: true, runValidators: true }
      ))
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/meniu-zilei  — public, o singură zi
router.get('/', async (req, res) => {
  try {
    const ziua = req.query.ziua || astazi();
    const meniu = await MeniuZilei.findOne({ ziua, activ: true });
    if (!meniu) return res.json(null);
    res.json(meniu);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/meniu-zilei/all  — protejat, ultimele 30 zile
router.get('/all', auth, async (req, res) => {
  try {
    const meniuri = await MeniuZilei.find().sort({ ziua: -1 }).limit(30);
    res.json(meniuri);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PUT /api/meniu-zilei  — protejat, upsert o singură zi
router.put('/', auth, async (req, res) => {
  try {
    const { ziua, fel1, fel2, pret, activ } = req.body;
    const targetZiua = ziua || astazi();

    const meniu = await MeniuZilei.findOneAndUpdate(
      { ziua: targetZiua },
      {
        ziua:   targetZiua,
        fel1:   { nume: fel1?.nume || '', desc: fel1?.desc || '' },
        fel2:   { nume: fel2?.nume || '', desc: fel2?.desc || '' },
        pret:   pret   ?? 35,
        activ:  activ  ?? true,
        inchis: req.body.inchis ?? false,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json(meniu);
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
