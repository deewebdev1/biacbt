'use strict';
const store = require('./_lib/store');
const { send, body, only, sign, limit } = require('./_lib/util');

/* Names are compared loosely: any order, any capital letters, accents and punctuation ignored,
   and a middle name is optional. Every word of one name must appear in the other. */
const words = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
function sameName(typed, registered) {
  const a = words(typed), b = words(registered);
  if (a.length < 2 || !b.length) return false;
  return a.every((w) => b.includes(w)) || b.every((w) => a.includes(w));
}

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();

module.exports = async (req, res) => {
  if (!only(req, res, 'POST')) return;
  try {
    if (!limit(req, 'login', 20, 60000)) return send(res, 429, { ok: false, error: 'Too many attempts. Please wait a minute and try again.' });
    const b = body(req);
    const tier = b.tier === 'paid' ? 'paid' : 'free';
    let student;

    if (tier === 'free') {
      const name = cleanName(b.name);
      if (name.length < 5 || name.length > 80 || name.split(' ').length < 2) return send(res, 200, { ok: false, error: 'Please enter your full name (first and last name).' });
      student = { name };
    } else {
      let id = String(b.bia_id || '').replace(/\D/g, '');
      if (!id || id.length > 6) return send(res, 200, { ok: false, error: 'Please enter your BIA ID.' });
      id = id.padStart(4, '0');
      const typed = cleanName(b.name);
      if (typed.split(' ').length < 2) return send(res, 200, { ok: false, error: 'Please enter your full name (first and last name).' });
      const s = await store.getStudent(id);
      // Same message for a wrong ID and a wrong name, so nobody can use it to find out which IDs exist.
      if (!s || !sameName(typed, s.name)) return send(res, 200, { ok: false, error: 'Your BIA ID and name do not match our records. Check both and try again.' });
      student = { name: s.name, bia_id: s.bia_id };
    }

    if (b.quiz) {
      const q = await store.getQuizByCode(String(b.quiz).slice(0, 40));
      if (!q || !q.open) return send(res, 200, { ok: false, error: 'This quiz link is not valid, or the quiz has been closed.' });
    }

    const token = sign({ tier, name: student.name, bia_id: student.bia_id || null, exp: Date.now() + 12 * 3600 * 1000 });
    send(res, 200, { ok: true, token, student });
  } catch (e) {
    console.error('login', e);
    send(res, 500, { ok: false, error: 'Something went wrong. Please try again.' });
  }
};
