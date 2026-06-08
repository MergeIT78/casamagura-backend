/**
 * Seed meniu online — Restaurant Casa Măgura
 * ───────────────────────────────────────────────────────────────────────────
 * Importă categoriile și produsele din data/meniu.json în MongoDB.
 *
 * CHEILE STABILE (NU se modifică niciodată — folosite de casa de marcat):
 *   • Categorie.idcat  = ID categorie casa de marcat
 *   • Produs.idmat     = ID produs casa de marcat (folosit în API-ul fiscal)
 *
 * Upsert idempotent:
 *   • categorii după `idcat`
 *   • produse  după `idmat`
 *   Rularea repetată păstrează aceleași documente (nu dublează, nu schimbă idmat).
 *
 * Sincronizare (implicit PORNITĂ):
 *   Produsele/categoriile din DB care NU există în meniu.json sunt șterse,
 *   astfel încât meniul online să corespundă EXACT fișierului.
 *   Dezactivează cu flag-ul --keep-extra.
 *
 * Usage:
 *   node seed-meniu.js                # sync complet (recomandat)
 *   node seed-meniu.js --keep-extra   # doar upsert, nu șterge nimic
 *   node seed-meniu.js --dry          # arată ce s-ar întâmpla, fără scriere
 *
 * Necesită MONGODB_URI în .env (sau USE_MEMORY_DB=true pentru test local).
 */
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');

const Categorie = require('./models/Categorie');
const Produs    = require('./models/Produs');

const KEEP_EXTRA = process.argv.includes('--keep-extra');
const DRY        = process.argv.includes('--dry');

async function getMongoUri() {
  if (process.env.USE_MEMORY_DB === 'true') {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    console.log('🧪 MongoDB in-memory (datele se pierd la finalul scriptului)');
    return mongod.getUri() + 'magura';
  }
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI lipsește din .env');
    process.exit(1);
  }
  return process.env.MONGODB_URI;
}

async function main() {
  const file = path.join(__dirname, 'data', 'meniu.json');
  const { _meta, categorii, produse } = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`\n📋 Sursă: ${_meta?.sursa || file}`);
  console.log(`   ${categorii.length} categorii · ${produse.length} produse`);
  console.log(`   Mod: ${DRY ? 'DRY-RUN (fără scriere)' : KEEP_EXTRA ? 'upsert (păstrează extra)' : 'SYNC complet'}\n`);

  await mongoose.connect(await getMongoUri());
  console.log('✅ MongoDB conectat');

  // ── 1. CATEGORII (upsert după idcat) ─────────────────────────────────────
  const catByIdcat = {};        // idcat -> _id
  let catNew = 0, catUpd = 0;
  for (const c of categorii) {
    if (DRY) { catByIdcat[c.idcat] = '(dry)'; continue; }
    const res = await Categorie.findOneAndUpdate(
      { idcat: c.idcat },
      { idcat: c.idcat, nume: c.nume, slug: c.slug, ordine: c.ordine, activa: c.activa },
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
    );
    const doc = res.value || res; // compat versiuni mongoose
    catByIdcat[c.idcat] = doc._id;
    if (res.lastErrorObject?.updatedExisting) catUpd++; else catNew++;
  }
  console.log(`📂 Categorii: ${catNew} noi, ${catUpd} actualizate`);

  // ── 2. PRODUSE (upsert după idmat) ───────────────────────────────────────
  let prodNew = 0, prodUpd = 0, prodSkip = 0;
  for (const p of produse) {
    const categorieId = catByIdcat[p.idcat];
    if (!categorieId) {
      console.warn(`   ⚠ Produs ${p.idmat} "${p.nume}" — idcat ${p.idcat} inexistent, sărit`);
      prodSkip++; continue;
    }
    if (DRY) continue;
    const res = await Produs.findOneAndUpdate(
      { idmat: p.idmat },
      {
        idmat: p.idmat, categorie: categorieId, nume: p.nume,
        descriere: p.descriere || '', pret: p.pret, gramaj: p.gramaj || '',
        alergeni: p.alergeni || '', imagine: p.imagine || '',
        disponibil: p.disponibil !== false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
    );
    if (res.lastErrorObject?.updatedExisting) prodUpd++; else prodNew++;
  }
  console.log(`🍽  Produse: ${prodNew} noi, ${prodUpd} actualizate${prodSkip ? `, ${prodSkip} sărite` : ''}`);

  // ── 3. SYNC — șterge ce nu e în meniu.json ───────────────────────────────
  if (!KEEP_EXTRA && !DRY) {
    const idmatSet = produse.map(p => p.idmat);
    const idcatSet = categorii.map(c => c.idcat);

    // produse fără idmat (vechi) sau cu idmat care nu mai există în fișier
    const prodDel = await Produs.deleteMany({
      $or: [{ idmat: { $exists: false } }, { idmat: null }, { idmat: { $nin: idmatSet } }],
    });
    // categorii fără idcat (vechi) sau cu idcat care nu mai există
    const catDel = await Categorie.deleteMany({
      $or: [{ idcat: { $exists: false } }, { idcat: null }, { idcat: { $nin: idcatSet } }],
    });
    console.log(`🧹 Curățare: ${prodDel.deletedCount} produse + ${catDel.deletedCount} categorii eliminate (nu erau în meniu.json)`);
  }

  // ── Rezumat ──────────────────────────────────────────────────────────────
  if (!DRY) {
    const [nc, np] = await Promise.all([Categorie.countDocuments(), Produs.countDocuments()]);
    console.log(`\n📊 Total în DB acum: ${nc} categorii · ${np} produse`);
  }
  console.log('✅ Gata.\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Eroare seed:', err);
  process.exit(1);
});
