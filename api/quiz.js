'use strict';
const store = require('./_lib/store');
const { send, body, only, auth, shuffle, view, studentKey } = require('./_lib/util');
const { getSettings } = require('./_lib/settings');
const { blockedMessage, stateOf } = require('./_lib/schedule');
const { pickQuestions } = require('./_lib/select');

module.exports = async (req, res) => {
  if (!only(req, res, 'POST')) return;
  const p = auth(req, res); if (!p) return;
  try {
    const quiz = await store.getQuizByCode(String(body(req).quiz || '').slice(0, 40));
    if (!quiz || !quiz.open) return send(res, 200, { ok: false, error: 'This quiz could not be found, or it has been closed.' });
    const key = p.bia_id ? null : studentKey(p.name);
    const findAttempt = () => (p.bia_id ? store.findTestAttempt(quiz.id, p.bia_id) : store.findTestAttemptByKey(quiz.id, key));

    const pool = await store.getQuestions(quiz.id);
    if (!pool.length) return send(res, 200, { ok: false, error: 'This quiz has no questions yet.' });
    const n = Math.min(quiz.per_student, pool.length);

    const meta = { id: quiz.code, title: quiz.title, subject: quiz.subject, program: quiz.programme, programme: quiz.programme, mode: quiz.mode, duration_minutes: quiz.mode === 'test' ? (quiz.duration_minutes || 30) : 0, question_count: n, tab_limit: (await getSettings()).tab_limit };

    // Schedule: a test already in progress may be finished; nobody can start a new one outside the window.
    // Outside the window the page still gets the quiz details, plus a `locked` block it shows as a "not open yet" screen.
    const blocked = blockedMessage(quiz);
    if (blocked) {
      const running = quiz.mode === 'test' ? await findAttempt() : null;
      if (!(running && running.status === 'in_progress')) {
        const now = Date.now();
        meta.locked = {
          state: stateOf(quiz, now), message: blocked, server_now: now,
          opens_at: quiz.opens_at ? new Date(quiz.opens_at).getTime() : null, closes_at: quiz.closes_at ? new Date(quiz.closes_at).getTime() : null
        };
        return send(res, 200, { ok: true, quiz: meta });
      }
    }

    if (quiz.mode === 'test') {
      // Test: no questions are sent here. They arrive at /api/start, after the student presses Begin.
      const a = await findAttempt();
      if (a && a.status === 'submitted') return send(res, 200, { ok: false, error: 'You have already taken this test.' });
      return send(res, 200, { ok: true, quiz: meta });
    }

    // Practice: a fresh random set every time, with answers and explanations.
    meta.questions = pickQuestions(pool, n, quiz.mix).map((q) => view(q, null, true));
    send(res, 200, { ok: true, quiz: meta });
  } catch (e) {
    console.error('quiz', e);
    send(res, 500, { ok: false, error: 'Could not load the quiz.' });
  }
};
