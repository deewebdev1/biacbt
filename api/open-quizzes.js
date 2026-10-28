'use strict';
const store = require('./_lib/store');
const { send, only, auth, studentKey } = require('./_lib/util');
const { stateOf } = require('./_lib/schedule');

module.exports = async (req, res) => {
  if (!only(req, res, 'GET')) return;
  const p = auth(req, res); if (!p) return;
  try {
    let quizzes = (await store.listOpenQuizzes()).filter((q) => q.pool > 0);

    const done = {};
    const mine = p.bia_id ? await store.testAttemptsForStudent(p.bia_id) : await store.testAttemptsForKey(studentKey(p.name));
    (mine || []).forEach((a) => { done[a.quiz_id] = a; });

    const now = Date.now();
    quizzes = quizzes.filter((q) => stateOf(q, now) !== 'closed' || (done[q.id] && done[q.id].status === 'in_progress'));   // closed quizzes disappear, unless the student is mid-test

    send(res, 200, {
      ok: true, server_now: now,
      quizzes: quizzes.map((q) => {
        const a = done[q.id];
        return {
          state: stateOf(q, now), opens_at: q.opens_at ? new Date(q.opens_at).getTime() : null, closes_at: q.closes_at ? new Date(q.closes_at).getTime() : null,
          code: q.code, title: q.title, subject: q.subject, programme: q.programme, mode: q.mode,
          questions: Math.min(q.per_student, q.pool), duration_minutes: q.mode === 'test' ? (q.duration_minutes || 30) : 0,
          status: a ? (a.status === 'submitted' ? 'completed' : 'in_progress') : 'available',
          last_score: a && a.status === 'submitted' && a.total ? Math.round(a.score / a.total * 100) : null
        };
      })
    });
  } catch (e) {
    console.error('open-quizzes', e);
    send(res, 500, { ok: false, error: 'Could not load quizzes.' });
  }
};
