'use strict';
const store = require('./_lib/store');
const { send, body, only, auth, view, KEYS } = require('./_lib/util');

const GRACE_MS = 120000;                    // network delay allowed after the timer ends
const REASONS = ['submitted', 'time_up', 'tab_switch'];

/* Builds the result the results page shows. `orders` maps question id -> original keys in the order the student saw. */
function buildResult(quiz, byId, ids, orders, answers, extra) {
  let score = 0;
  const rows = ids.map((id) => {
    const q = byId[id]; if (!q) return null;
    const order = orders[id] || KEYS;
    const shown = view(q, order, true);
    const chosen = KEYS.indexOf(answers[id]) > -1 ? answers[id] : null;
    const correct = chosen !== null && order[KEYS.indexOf(chosen)] === q.answer;
    if (correct) score++;
    return { id: q.id, text: q.text, options: shown.options, chosen, answer: shown.answer, correct, explanation: shown.explanation };
  }).filter(Boolean);
  const total = rows.length;
  return Object.assign({ quiz: quiz.code, title: quiz.title, mode: quiz.mode, score, total, percent: total ? Math.round(score / total * 100) : 0, rows }, extra);
}

function cleanAnswers(a) {
  const out = {};
  if (a && typeof a === 'object') Object.keys(a).slice(0, 400).forEach((k) => { if (KEYS.indexOf(a[k]) > -1) out[k] = a[k]; });
  return out;
}

module.exports = async (req, res) => {
  if (!only(req, res, 'POST')) return;
  const p = auth(req, res); if (!p) return;
  try {
    const b = body(req);
    const quiz = await store.getQuizByCode(String(b.quiz || '').slice(0, 40));   // closed quizzes can still be submitted
    if (!quiz) return send(res, 200, { ok: false, error: 'This quiz could not be found.' });
    const pool = await store.getQuestions(quiz.id);
    const byId = {}; pool.forEach((q) => { byId[q.id] = q; });
    let switches = parseInt(b.tab_switches, 10); switches = isNaN(switches) ? 0 : Math.max(0, Math.min(50, switches));
    let reason = REASONS.indexOf(b.reason) > -1 ? b.reason : 'submitted';
    let answers = cleanAnswers(b.answers);

    if (quiz.mode === 'test') {
      if (p.tier !== 'paid' || !p.bia_id) return send(res, 200, { ok: false, error: 'Test mode is for paying tutorial students.' });
      const a = await store.findTestAttempt(quiz.id, p.bia_id);
      if (!a) return send(res, 200, { ok: false, error: 'No test in progress was found.' });

      if (a.status === 'submitted') {                                   // double submit: same result again
        return send(res, 200, { ok: true, result: buildResult(quiz, byId, a.question_ids, a.option_orders, a.answers || {}, { seconds_taken: a.seconds_taken || 0, tab_switches: a.tab_switches || 0, reason: a.reason || 'submitted' }) });
      }
      const now = Date.now(), ends = new Date(a.ends_at).getTime();
      if (now > ends + GRACE_MS) { answers = {}; reason = 'time_up'; }    // too late: nothing counts
      else if (now > ends && reason === 'submitted') reason = 'time_up';
      const seconds = Math.max(0, Math.round((Math.min(now, ends) - new Date(a.started_at).getTime()) / 1000));
      const result = buildResult(quiz, byId, a.question_ids, a.option_orders, answers, { seconds_taken: seconds, tab_switches: switches, reason });
      const closed = await store.closeAttempt(a.id, { status: 'submitted', submitted_at: new Date().toISOString(), score: result.score, total: result.total, seconds_taken: seconds, tab_switches: switches, reason, answers });
      if (!closed) {                                                      // someone closed it a moment ago
        const again = await store.findTestAttempt(quiz.id, p.bia_id);
        return send(res, 200, { ok: true, result: buildResult(quiz, byId, again.question_ids, again.option_orders, again.answers || {}, { seconds_taken: again.seconds_taken || 0, tab_switches: again.tab_switches || 0, reason: again.reason || 'submitted' }) });
      }
      return send(res, 200, { ok: true, result });
    }

    // Practice: grade the questions the student was shown. Only ids that belong to this quiz count.
    const ids = (Array.isArray(b.question_ids) ? b.question_ids : []).filter((id, i, arr) => typeof id === 'string' && byId[id] && arr.indexOf(id) === i).slice(0, Math.min(quiz.per_student, pool.length));
    if (!ids.length) return send(res, 200, { ok: false, error: 'Nothing to grade.' });
    let secs = parseInt(b.seconds_taken, 10); secs = isNaN(secs) ? 0 : Math.max(0, Math.min(86400, secs));
    const result = buildResult(quiz, byId, ids, {}, answers, { seconds_taken: secs, tab_switches: 0, reason: 'submitted' });
    await store.createAttempt({ quiz_id: quiz.id, tier: p.tier, student_name: p.name, bia_id: p.bia_id || null, mode: 'practice', status: 'submitted', submitted_at: new Date().toISOString(), score: result.score, total: result.total, seconds_taken: secs, tab_switches: 0, reason: 'submitted', question_ids: ids, answers });
    send(res, 200, { ok: true, result });
  } catch (e) {
    console.error('submit', e);
    send(res, 500, { ok: false, error: 'Could not submit. Your answers are still on this page, please try again.' });
  }
};
