// Nooré shop server: serves the website and a small API.
// The database password stays here on the server (in .env), never in the website code.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, DB_NAME = 'noore', ADMIN_KEY, SESSION_SECRET, PORT = 3000 } = process.env;
if (!MONGODB_URI || MONGODB_URI.includes('PASTE_PASSWORD_HERE') || MONGODB_URI.includes('YOUR_CLUSTER_HOST') || !ADMIN_KEY || !SESSION_SECRET) {
  console.error('Please fill MONGODB_URI, ADMIN_KEY and SESSION_SECRET in the .env file.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '6mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  next();
});

let products, settings, admin; // admin = { salt, hash }
const hashKey = (k, salt) => crypto.scryptSync(String(k), salt, 32).toString('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- sessions (signed token, 12 hours) ----
const sign = (data) => crypto.createHmac('sha256', SESSION_SECRET + admin.salt).update(data).digest('base64url');
function makeToken() { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 })).toString('base64url'); return p + '.' + sign(p); }
function requireAdmin(req, res, next) {
  const t = (req.get('Authorization') || '').replace('Bearer ', '');
  const [p, s] = t.split('.');
  try {
    if (p && s && safeEq(sign(p), s) && JSON.parse(Buffer.from(p, 'base64url')).exp > Date.now()) return next();
  } catch (e) { /* fall through */ }
  res.status(401).json({ error: 'Please log in again.' });
}

// ---- login attempts limit ----
const tries = new Map();
function limited(ip) { const t = tries.get(ip); return t && t.n >= 5 && Date.now() < t.until; }
function fail(ip) { const t = tries.get(ip) || { n: 0 }; t.n++; if (t.n >= 5) t.until = Date.now() + 15 * 60 * 1000; tries.set(ip, t); }

// ---- product validation ----
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 30);
function clean(b) {
  const code = str(b.code, 30).replace(/[^A-Za-z0-9_-]/g, '');
  const name = str(b.name, 120), price = Number(b.price);
  if (!code || !name || !(price > 0)) return null;
  const img = typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 3e6 ? b.img : '';
  return { code, name, cat: str(b.cat, 40) || 'General', price, old: Number(b.old) > 0 ? Number(b.old) : 0,
    sizes: list(b.sizes), colors: list(b.colors), desc: str(b.desc, 1000), img, out: !!b.out };
}

// ---- public API ----
app.get('/api/products', async (req, res) => {
  try {
    const items = await products.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    res.set('Cache-Control', 'no-store').json(items);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load products.' }); }
});

// ---- admin API ----
app.post('/api/admin/login', (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many wrong tries. Please wait 15 minutes.' });
  const ok = safeEq(hashKey(req.body.key || '', admin.salt), admin.hash);
  if (!ok) { fail(req.ip); return res.status(401).json({ error: 'Wrong key. Try again.' }); }
  tries.delete(req.ip);
  res.json({ token: makeToken() });
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const p = clean(req.body);
    if (!p) return res.status(400).json({ error: 'Enter a product name and a price.' });
    const oldCode = str(req.body.oldCode, 30);
    if (oldCode) {
      if (oldCode !== p.code && await products.findOne({ code: p.code })) return res.status(409).json({ error: 'This code is already used.' });
      await products.updateOne({ code: oldCode }, { $set: p });
    } else {
      if (await products.findOne({ code: p.code })) return res.status(409).json({ error: 'This code is already used.' });
      await products.insertOne({ ...p, createdAt: new Date() });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save the product.' }); }
});

app.delete('/api/admin/products/:code', requireAdmin, async (req, res) => {
  try { await products.deleteOne({ code: req.params.code }); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Could not remove the product.' }); }
});

app.post('/api/admin/change-key', requireAdmin, async (req, res) => {
  const k = String(req.body.key || '');
  if (k.length < 6) return res.status(400).json({ error: 'Use at least 6 characters.' });
  const salt = crypto.randomBytes(16).toString('hex');
  admin = { salt, hash: hashKey(k, salt) };
  await settings.updateOne({ _id: 'admin' }, { $set: admin }, { upsert: true });
  res.json({ ok: true, token: makeToken() }); // old sessions stop working, this one continues
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- start ----
const SAMPLE = [
  ['NM-001', 'Chiffon Hijab', 'Hijab', 450, 550, ['Free'], ['Dusty Rose', 'Beige', 'Mocha'], 'Lightweight chiffon, easy to drape and stays in place.'],
  ['NM-002', 'Silk Touch Scarf', 'Hijab', 650, 0, ['Free'], ['Ivory', 'Copper', 'Brown'], 'Smooth silk-touch fabric with a soft shine.'],
  ['NM-003', 'Classic Abaya', 'Abaya', 2850, 3200, ['52', '54', '56'], ['Black', 'Brown'], 'Relaxed fit, breathable fabric, full length.']
];
(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  products = db.collection('products');
  settings = db.collection('settings');
  await products.createIndex({ code: 1 }, { unique: true });
  admin = await settings.findOne({ _id: 'admin' });
  if (!admin) {
    const salt = crypto.randomBytes(16).toString('hex');
    admin = { salt, hash: hashKey(ADMIN_KEY, salt) };
    await settings.insertOne({ _id: 'admin', ...admin });
  }
  if ((await products.countDocuments()) === 0) {
    await products.insertMany(SAMPLE.map(([code, name, cat, price, old, sizes, colors, desc], i) =>
      ({ code, name, cat, price, old, sizes, colors, desc, img: '', out: false, createdAt: new Date(Date.now() - i) })));
  }
  app.listen(PORT, () => console.log('Noore shop running on http://localhost:' + PORT));
})().catch((e) => { console.error('Could not start. Check MONGODB_URI and Atlas Network Access.\n', e.message); process.exit(1); });
