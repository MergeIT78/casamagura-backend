const router = require('express').Router();
const Vizita = require('../models/Vizita');
const auth   = require('../middleware/auth');

// POST /api/stats/vizita  — public (tracking)
router.post('/vizita', async (req, res) => {
  try {
    const { pagina, device } = req.body;
    if (!pagina) return res.status(400).json({ error: 'pagina lipsă' });

    const validDevice = ['mobile', 'desktop', 'tablet'].includes(device) ? device : 'desktop';
    const ua = (req.headers['user-agent'] || '').slice(0, 300);

    await Vizita.create({ pagina: pagina.slice(0, 200), device: validDevice, ua });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/stats  — protejat
router.get('/', auth, async (req, res) => {
  try {
    const azi = new Date();
    azi.setHours(0, 0, 0, 0);

    const inceputSaptamana = new Date(azi);
    inceputSaptamana.setDate(azi.getDate() - azi.getDay() + (azi.getDay() === 0 ? -6 : 1));

    const acum30Zile = new Date(azi);
    acum30Zile.setDate(azi.getDate() - 29);

    const [total, azi_count, saptamana_count, perPagina, perDevice, grafic30] = await Promise.all([
      Vizita.countDocuments(),
      Vizita.countDocuments({ createdAt: { $gte: azi } }),
      Vizita.countDocuments({ createdAt: { $gte: inceputSaptamana } }),

      // Vizite per pagină (top 10)
      Vizita.aggregate([
        { $group: { _id: '$pagina', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Desktop vs mobile vs tablet
      Vizita.aggregate([
        { $group: { _id: '$device', count: { $sum: 1 } } },
      ]),

      // Ultimele 30 zile — vizite per zi
      Vizita.aggregate([
        { $match: { createdAt: { $gte: acum30Zile } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          }
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      total,
      azi:      azi_count,
      saptamana: saptamana_count,
      perPagina,
      perDevice,
      grafic30,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
