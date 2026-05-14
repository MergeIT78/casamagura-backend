require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const authRoutes      = require('./routes/auth');
const contactRoutes   = require('./routes/contact');
const statsRoutes     = require('./routes/stats');
const rezervariRoutes = require('./routes/rezervari');
const meniuZileiRoutes = require('./routes/meniuZilei');
const categoriiRoutes = require('./routes/categorii');
const produseRoutes   = require('./routes/produse');
const comenziRoutes   = require('./routes/comenzi');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, cb) => {
    // Permite Postman/curl (no origin) și orice în dev (lista goală)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS blocat: ${origin}`));
    }
  },
  credentials: true,
}));

// ── BODY PARSER ───────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── ROUTES ────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/contact',    contactRoutes);
app.use('/api/stats',      statsRoutes);
app.use('/api/rezervari',  rezervariRoutes);
app.use('/api/meniu-zilei', meniuZileiRoutes);
app.use('/api/categorii',  categoriiRoutes);
app.use('/api/produse',    produseRoutes);
app.use('/api/comenzi',    comenziRoutes);

// Health check — ping de la Render / UptimeRobot ca sa nu adoarma
app.get('/health',     (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Ruta negasita' }));

// ── MONGODB + START ───────────────────────────────────────────────────
async function startServer() {
  let mongoUri = process.env.MONGODB_URI;

  // Mod local fara Atlas: porneste MongoDB in memorie (date temporare)
  if (process.env.USE_MEMORY_DB === 'true') {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri() + 'magura';
    console.log('🧪 MongoDB in-memory pornit (datele se pierd la restart)');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB conectat');

    // Daca e in-memory, creeaza admin automat (baza de date e goala)
    if (process.env.USE_MEMORY_DB === 'true') {
      await seedAdmin();
    }

    app.listen(PORT, () => console.log(`🚀 Server pornit pe portul ${PORT}`));
  } catch (err) {
    console.error('❌ Eroare conectare MongoDB:', err.message);
    process.exit(1);
  }
}

async function seedAdmin() {
  const Admin = require('./models/Admin');
  const exists = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
  if (!exists) {
    await new Admin({
      email:    process.env.ADMIN_EMAIL    || 'admin@magura.ro',
      password: process.env.ADMIN_PASSWORD || 'Admin1234!',
    }).save();
    console.log(`👤 Admin creat: ${process.env.ADMIN_EMAIL || 'admin@magura.ro'}`);
  }
}

startServer();
