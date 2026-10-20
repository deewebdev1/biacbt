'use strict';
const store = require('./_lib/store');
const { send, only, auth } = require('./_lib/util');

module.exports = async (req, res) => {
  if (!only(req, res, 'GET')) return;
  const p = auth(req, res); if (!p) return;
  try {
    let quizzes = (await store.listOpenQuizzes()).filter((q) => q.pool > 0);
    if (p.tier !== 'paid') quizzes = quizzes.filter((q) => q.mode === 'practice');   // free class: Practice only

    const done = {};
    if (p.tier === 'paid' && p.bia_id) (await store.testAttemptsForStudent(p.bia_id) || []).forEach((a) => { done[a.quiz_id] = a; });

    send(res, 200, {
      ok: true,
      quizzes: quizzes.map((q) => {
        const a = done[q.id];
        return {
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
