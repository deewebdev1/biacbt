'use strict';
const history = require('./_lib/history');
const { buildResult } = require('./_lib/result');
const { send, body, only, auth } = require('./_lib/util');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (!only(req, res, 'POST')) return;
  const p = auth(req, res); if (!p) return;
  try {
    if (p.tier !== 'paid' || !p.bia_id) return send(res, 200, { ok: false, error: 'Results history is for paying tutorial students.' });
    const id = String(body(req).id || '');
    if (!UUID.test(id)) return send(res, 200, { ok: false, error: 'Result not found.' });

    const a = await history.getAttempt(id);
    // A student can only open their own submitted attempts.
    if (!a || a.bia_id !== p.bia_id || a.status !== 'submitted') return send(res, 200, { ok: false, error: 'Result not found.' });

    const quiz = await history.getQuiz(a.quiz_id);
    if (!quiz) return send(res, 200, { ok: false, error: 'Result not found.' });
    const pool = await history.getQuestions(a.quiz_id);
    const byId = {}; pool.forEach((q) => { byId[q.id] = q; });

    send(res, 200, { ok: true, result: buildResult(quiz, byId, a.question_ids || [], a.option_orders || {}, a.answers || {}, { seconds_taken: a.seconds_taken || 0, tab_switches: a.tab_switches || 0, reason: a.reason || 'submitted' }) });
  } catch (e) {
    console.error('my-result', e);
    send(res, 500, { ok: false, error: 'Could not load this result.' });
  }
};
