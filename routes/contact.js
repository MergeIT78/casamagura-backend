const router   = require('express').Router();
const Contact  = require('../models/Contact');
const auth     = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Transporter email (optional — nu blochează dacă nu e configurat)
function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// POST /api/contact  — public
router.post('/', async (req, res) => {
  try {
    const { nume, telefon, mesaj, dataRezervare } = req.body;
    if (!nume?.trim() || !telefon?.trim() || !mesaj?.trim()) {
      return res.status(400).json({ error: 'Nume, telefon și mesaj sunt obligatorii' });
    }

    const contact = await Contact.create({
      nume:          nume.trim().slice(0, 100),
      telefon:       telefon.trim().slice(0, 30),
      mesaj:         mesaj.trim().slice(0, 1000),
      dataRezervare: dataRezervare?.trim() || '',
    });

    // Trimite email notificare (dacă e configurat)
    const transporter = getTransporter();
    if (transporter && process.env.EMAIL_TO) {
      transporter.sendMail({
        from: `"Site Măgura" <${process.env.SMTP_USER}>`,
        to:   process.env.EMAIL_TO,
        subject: `[Măgura] Mesaj nou de la ${contact.nume}`,
        text: `Nume: ${contact.nume}\nTelefon: ${contact.telefon}\nData rezervare: ${contact.dataRezervare || '-'}\n\nMesaj:\n${contact.mesaj}`,
      }).catch(err => console.warn('Email notificare eșuat:', err.message));
    }

    res.status(201).json({ ok: true, id: contact._id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/contact  — protejat (CRM)
router.get('/', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [mesaje, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Contact.countDocuments(),
    ]);

    res.json({
      mesaje,
      total,
      pagina: page,
      pagini: Math.ceil(total / limit),
      necitite: await Contact.countDocuments({ citit: false }),
    });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// PATCH /api/contact/:id/citit  — protejat
router.patch('/:id/citit', auth, async (req, res) => {
  try {
    const { citit } = req.body;
    const doc = await Contact.findByIdAndUpdate(req.params.id, { citit: !!citit }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Mesaj negăsit' });
    res.json(doc);
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

module.exports = router;
