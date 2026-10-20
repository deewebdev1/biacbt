'use strict';
const store = require('./_lib/store');
const { send, body, only, sign, limit } = require('./_lib/util');

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
      const s = await store.getStudent(id);
      if (!s) return send(res, 200, { ok: false, error: 'BIA ID not found. Check the number and try again.' });
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
