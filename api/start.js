'use strict';
const store = require('./_lib/store');
const { send, body, only, auth, shuffle, view, KEYS, studentKey, deviceMark, DEVICE_MSG } = require('./_lib/util');
const { blockedMessage } = require('./_lib/schedule');
const { pickQuestions } = require('./_lib/select');

function present(attempt, byId) {
  return attempt.question_ids.map((id) => byId[id]).filter(Boolean).map((q) => view(q, attempt.option_orders[q.id], false));
}

module.exports = async (req, res) => {
  if (!only(req, res, 'POST')) return;
  const p = auth(req, res); if (!p) return;
  try {
    const quiz = await store.getQuizByCode(String(body(req).quiz || '').slice(0, 40));
    if (!quiz || quiz.mode !== 'test') return send(res, 200, { ok: false, error: 'This test could not be found.' });
    const key = p.bia_id ? null : studentKey(p.name);
    const dm = p.bia_id ? null : deviceMark(req, res, body(req));          // free class: the device is part of the identity
    const findAttempt = () => (p.bia_id ? store.findTestAttempt(quiz.id, p.bia_id) : store.findTestAttemptByKey(quiz.id, key));

    const pool = await store.getQuestions(quiz.id);
    const byId = {}; pool.forEach((q) => { byId[q.id] = q; });

    let attempt = await findAttempt();
    if (attempt && attempt.status === 'submitted') return send(res, 200, { ok: false, error: 'You have already taken this test.' });

    if (!attempt && dm) {                                              // a different name already used this device for this test
      const hits = await store.testAttemptsOnDevice(quiz.id, dm.ids);
      if ((hits || []).some((a) => a.student_key !== key)) return send(res, 200, { ok: false, error: DEVICE_MSG });
    }

    if (!attempt) {
      const blocked = blockedMessage(quiz);
      if (blocked) return send(res, 200, { ok: false, error: blocked });
      if (!pool.length) return send(res, 200, { ok: false, error: 'This test has no questions yet.' });
      const chosen = pickQuestions(pool, Math.min(quiz.per_student, pool.length), quiz.mix);
      const orders = {}; chosen.forEach((q) => { orders[q.id] = quiz.shuffle_options ? shuffle(KEYS) : KEYS.slice(); });
      const minutes = quiz.duration_minutes || 30;
      try {
        attempt = await store.createAttempt({
          quiz_id: quiz.id, tier: p.tier, student_name: p.name, bia_id: p.bia_id || null, student_key: key, device_id: dm ? dm.cookieId : null, device_ls: dm ? (dm.lsId || null) : null, mode: 'test', status: 'in_progress',
          ends_at: new Date(Date.now() + minutes * 60000).toISOString(), question_ids: chosen.map((q) => q.id), option_orders: orders
        });
      } catch (e) {
        if (e && e.code === '23505') {                       // two taps at once: use the attempt that won
          attempt = await findAttempt();
          if (!attempt) throw e;
          if (attempt.status === 'submitted') return send(res, 200, { ok: false, error: 'You have already taken this test.' });
        } else throw e;
      }
    }

    // Same set, same order, same end time every time this is called for this attempt.
    send(res, 200, { ok: true, ends_at: new Date(attempt.ends_at).getTime(), server_now: Date.now(), questions: present(attempt, byId) });
  } catch (e) {
    console.error('start', e);
    send(res, 500, { ok: false, error: 'Could not start the test. Please try again.' });
  }
};
