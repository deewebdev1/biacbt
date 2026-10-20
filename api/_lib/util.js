'use strict';
const crypto = require('crypto');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function only(req, res, method) {
  if (req.method !== method) { res.setHeader('Allow', method); send(res, 405, { ok: false, error: 'Method not allowed.' }); return false; }
  return true;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or too short');
  return s;
}

const b64u = (x) => Buffer.from(x).toString('base64url');

/* Signed session token: base64url(payload).signature. Nobody can change the payload without the secret. */
function sign(payload) {
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac('sha256', secret()).update(p).digest('base64url');
  return p + '.' + s;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret()).update(parts[0]).digest();
  let given;
  try { given = Buffer.from(parts[1], 'base64url'); } catch (e) { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

/* Reads the Bearer token. Sends 401 and returns null when it is missing or wrong. */
function auth(req, res) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const p = verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p) { send(res, 401, { ok: false, error: 'Please log in again.' }); return null; }
  return p;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* Best-effort limiter. Serverless instances do not share memory, so for real protection also turn on
   Vercel Firewall rate limiting for /api/login. */
const hits = new Map();
function limit(req, key, max, windowMs) {
  const ip = String((req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || 'x').split(',')[0].trim();
  const k = key + ':' + ip, now = Date.now(), h = hits.get(k);
  if (!h || now - h.t > windowMs) { hits.set(k, { n: 1, t: now }); if (hits.size > 5000) hits.clear(); return true; }
  h.n++; return h.n <= max;
}

const KEYS = ['A', 'B', 'C', 'D'];

/* Shows a question to a student. `order` is the list of ORIGINAL option keys in the order the student sees them. */
function view(q, order, withAnswer) {
  const opts = Array.isArray(q.options) ? q.options : [];
  const text = (k) => { const o = opts.find((x) => x && x.key === k); return o ? String(o.text) : ''; };
  const o = order || KEYS;
  const out = { id: q.id, text: q.text, options: o.map((orig, i) => ({ key: KEYS[i], text: text(orig) })) };
  if (withAnswer) { out.answer = KEYS[o.indexOf(q.answer)]; out.explanation = q.explanation || ''; }
  return out;
}

module.exports = { send, body, only, sign, verify, auth, shuffle, limit, view, KEYS };
