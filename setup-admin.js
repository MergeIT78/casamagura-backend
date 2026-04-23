/**
 * Script de setup inițial — rulează o singură dată pentru a crea contul de admin
 * Usage: node setup-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin    = require('./models/Admin');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB conectat');

  const count = await Admin.countDocuments();
  if (count > 0) {
    console.log('Admin există deja. Dacă vrei să resetezi, șterge manual documentul din DB.');
    process.exit(0);
  }

  const email    = process.env.ADMIN_EMAIL    || 'admin@magura.ro';
  const password = process.env.ADMIN_PASSWORD || 'Admin1234!';

  await Admin.create({ email, password });
  console.log(`✅ Admin creat: ${email}`);
  console.log('   Parolă din .env:', password);
  console.log('   Schimbă parola după primul login!');

  process.exit(0);
}

main().catch(err => {
  console.error('Eroare:', err.message);
  process.exit(1);
});
