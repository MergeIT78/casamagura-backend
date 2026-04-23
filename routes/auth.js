const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const Admin   = require('../models/Admin');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email și parola sunt obligatorii' });

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(401).json({ error: 'Credențiale incorecte' });

    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Credențiale incorecte' });

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, email: admin.email });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// POST /api/auth/setup  — creare admin inițial (rulează o singură dată)
router.post('/setup', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return res.status(403).json({ error: 'Admin există deja' });

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email și parola sunt obligatorii' });
    if (password.length < 8)  return res.status(400).json({ error: 'Parola trebuie să aibă minim 8 caractere' });

    const admin = await Admin.create({ email, password });
    res.status(201).json({ message: 'Admin creat', email: admin.email });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email deja folosit' });
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
