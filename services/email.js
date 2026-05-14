/**
 * Serviciu email — Resend
 * Trimite:
 *   1. Notificare restaurant cand apare o comanda noua
 *   2. Confirmare client (daca a furnizat email)
 */
const { Resend } = require('resend');

let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️  RESEND_API_KEY lipsa — emailurile sunt dezactivate');
}

const FROM     = process.env.RESEND_FROM  || 'Magura Restaurant <onboarding@resend.dev>';
const TO_ADMIN = process.env.RESEND_TO    || process.env.ADMIN_EMAIL || 'admin@magura.ro';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatData(dateStr) {
  return new Date(dateStr).toLocaleString('ro-RO', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function tipLabel(tip) {
  return tip === 'livrare' ? 'Livrare la adresă' : 'Ridicare din restaurant';
}

function platLabel(metoda) {
  if (metoda === 'card')        return 'Card la ridicare';
  if (metoda === 'card-online') return 'Card online (Stripe)';
  return 'Cash';
}

// ── Template email restaurant ─────────────────────────────────────────────────

function htmlRestaurant(comanda) {
  const rows = comanda.produse.map(p => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8d0;font-family:Georgia,serif;font-size:.95rem;color:#1a0810">${p.nume}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8d0;text-align:center;font-family:Arial,sans-serif;font-size:.85rem;color:#6c131d;font-weight:700">${p.cantitate}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8d0;text-align:right;font-family:Arial,sans-serif;font-size:.85rem;color:#444">${(p.pret * p.cantitate).toFixed(0)} lei</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:4px solid #6c131d;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- HEADER -->
  <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #f0e8d0">
    <div style="font-size:.55rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:#6c131d;margin-bottom:6px">Restaurant Măgura · Cisnădie</div>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:1.6rem;color:#1a0810;font-weight:400">
      Comandă nouă <strong style="color:#6c131d">#${comanda.numar}</strong>
    </h1>
    <div style="margin-top:6px;font-size:.8rem;color:#999">${formatData(comanda.createdAt)}</div>
  </td></tr>

  <!-- PRODUSE -->
  <tr><td style="padding:24px 36px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <th style="text-align:left;font-size:.52rem;letter-spacing:.18em;text-transform:uppercase;color:#aaa;padding-bottom:8px;font-weight:600">Produs</th>
        <th style="text-align:center;font-size:.52rem;letter-spacing:.18em;text-transform:uppercase;color:#aaa;padding-bottom:8px;font-weight:600">Cant.</th>
        <th style="text-align:right;font-size:.52rem;letter-spacing:.18em;text-transform:uppercase;color:#aaa;padding-bottom:8px;font-weight:600">Preț</th>
      </tr>
      ${rows}
      <tr>
        <td colspan="2" style="padding-top:14px;font-size:.65rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#444">Total</td>
        <td style="padding-top:14px;text-align:right;font-family:Georgia,serif;font-size:1.3rem;font-weight:700;color:#6c131d">${comanda.total.toFixed(0)} lei</td>
      </tr>
    </table>
  </td></tr>

  <!-- DETALII CLIENT -->
  <tr><td style="padding:0 36px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border-left:3px solid #6c131d">
      <tr><td style="padding:18px 20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:110px;font-size:.7rem;color:#aaa;text-transform:uppercase;letter-spacing:.1em;padding:4px 0">Client</td>
            <td style="font-size:.9rem;color:#1a0810;font-weight:600;padding:4px 0">${comanda.client.nume}</td>
          </tr>
          <tr>
            <td style="font-size:.7rem;color:#aaa;text-transform:uppercase;letter-spacing:.1em;padding:4px 0">Telefon</td>
            <td style="font-size:.9rem;color:#1a0810;padding:4px 0">
              <a href="tel:${comanda.client.telefon}" style="color:#6c131d;text-decoration:none">${comanda.client.telefon}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:.7rem;color:#aaa;text-transform:uppercase;letter-spacing:.1em;padding:4px 0">Tip</td>
            <td style="font-size:.9rem;color:#1a0810;padding:4px 0">${tipLabel(comanda.tip)}${comanda.tip === 'livrare' && comanda.client.adresa ? '<br><span style="font-size:.8rem;color:#666">' + comanda.client.adresa + '</span>' : ''}</td>
          </tr>
          <tr>
            <td style="font-size:.7rem;color:#aaa;text-transform:uppercase;letter-spacing:.1em;padding:4px 0">Plată</td>
            <td style="font-size:.9rem;color:#1a0810;padding:4px 0">${platLabel(comanda.metodaPlata)}</td>
          </tr>
          ${comanda.observatii ? `
          <tr>
            <td style="font-size:.7rem;color:#aaa;text-transform:uppercase;letter-spacing:.1em;padding:4px 0">Obs.</td>
            <td style="font-size:.85rem;color:#888;font-style:italic;padding:4px 0">${comanda.observatii}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 36px 32px">
    <a href="https://admin.casa-magura.ro" style="display:inline-block;background:#6c131d;color:#fff;text-decoration:none;padding:14px 28px;font-size:.7rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase">
      Deschide Admin &rarr;
    </a>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:16px 36px;border-top:1px solid #f0e8d0;background:#faf7f2">
    <p style="margin:0;font-size:.72rem;color:#bbb">Str. Cindrelului nr. 1, Cisnădie, Sibiu &middot; <a href="tel:0269562565" style="color:#6c131d;text-decoration:none">0269 562 565</a></p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ── Template email client ─────────────────────────────────────────────────────

function htmlClient(comanda) {
  const items = comanda.produse.map(p =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0e8d0;font-family:Georgia,serif;font-size:.9rem;color:#1a0810">${p.cantitate}&times; ${p.nume}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0e8d0;text-align:right;font-family:Arial,sans-serif;font-size:.85rem;color:#444">${(p.pret * p.cantitate).toFixed(0)} lei</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:4px solid #6c131d;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- HEADER -->
  <tr><td style="padding:28px 36px 20px;border-bottom:1px solid #f0e8d0">
    <div style="font-size:.55rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:#6c131d;margin-bottom:6px">Restaurant Măgura · Cisnădie</div>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:1.5rem;color:#1a0810;font-weight:400">
      Comanda ta a fost <strong>primită!</strong>
    </h1>
    <div style="margin-top:8px;display:inline-block;background:#6c131d;color:#fff;font-size:.6rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:4px 12px">
      #${comanda.numar}
    </div>
  </td></tr>

  <!-- MESAJ -->
  <tr><td style="padding:24px 36px 16px">
    <p style="margin:0;font-size:.95rem;color:#444;line-height:1.75">
      Bună ziua, <strong>${comanda.client.nume}</strong>! 👋<br><br>
      Mulțumim pentru comandă. O pregătim cu grijă și te vom contacta la
      <strong>${comanda.client.telefon}</strong> pentru confirmare.
    </p>
  </td></tr>

  <!-- PRODUSE -->
  <tr><td style="padding:0 36px 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${items}
      <tr>
        <td style="padding-top:14px;font-size:.65rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#444">Total</td>
        <td style="padding-top:14px;text-align:right;font-family:Georgia,serif;font-size:1.2rem;font-weight:700;color:#6c131d">${comanda.total.toFixed(0)} lei</td>
      </tr>
    </table>
  </td></tr>

  <!-- INFO LIVRARE -->
  <tr><td style="padding:0 36px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border-left:3px solid #6c131d">
      <tr><td style="padding:14px 20px;font-size:.85rem;color:#444;line-height:1.7">
        <strong>${tipLabel(comanda.tip)}</strong>${comanda.tip === 'livrare' && comanda.client.adresa ? '<br>' + comanda.client.adresa : ''}<br>
        Plată: ${platLabel(comanda.metodaPlata)}
        ${comanda.observatii ? '<br><em style="color:#888">' + comanda.observatii + '</em>' : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:16px 36px;border-top:1px solid #f0e8d0;background:#faf7f2">
    <p style="margin:0;font-size:.75rem;color:#999;line-height:1.6">
      Str. Cindrelului nr. 1, Cisnădie, Sibiu<br>
      <a href="tel:0269562565" style="color:#6c131d;text-decoration:none">0269 562 565</a> &middot;
      <a href="https://www.casa-magura.ro" style="color:#6c131d;text-decoration:none">casa-magura.ro</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ── Functii exportate ─────────────────────────────────────────────────────────

/**
 * Notifica restaurantul cand apare o comanda noua.
 * Apelata intotdeauna.
 */
async function notificaRestaurant(comanda) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from:    FROM,
      to:      TO_ADMIN,
      subject: `🍽️ Comandă nouă #${comanda.numar} — ${comanda.client.nume} (${tipLabel(comanda.tip)}) — ${comanda.total.toFixed(0)} lei`,
      html:    htmlRestaurant(comanda),
    });
    console.log(`📧 Email restaurant trimis pentru comanda #${comanda.numar}`);
  } catch (err) {
    console.error('❌ Email restaurant error:', err.message);
  }
}

/**
 * Trimite confirmare clientului.
 * Apelata doar daca comanda.client.email exista.
 */
async function confirmareClient(comanda) {
  if (!resend || !comanda.client?.email) return;
  try {
    await resend.emails.send({
      from:    FROM,
      to:      comanda.client.email,
      subject: `Comanda ta #${comanda.numar} a fost primită — Măgura`,
      html:    htmlClient(comanda),
    });
    console.log(`📧 Email confirmare trimis la ${comanda.client.email}`);
  } catch (err) {
    console.error('❌ Email client error:', err.message);
  }
}

module.exports = { notificaRestaurant, confirmareClient };
