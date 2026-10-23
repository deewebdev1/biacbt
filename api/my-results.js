'use strict';
const history = require('./_lib/history');
const { send, only, auth } = require('./_lib/util');
const { getSettings } = require('./_lib/settings');

module.exports = async (req, res) => {
  if (!only(req, res, 'GET')) return;
  const p = auth(req, res); if (!p) return;
  try {
    const PASS_MARK = (await getSettings()).pass_mark;   // set on the admin Settings page
    // Free class students log in with a name only, so there is no safe way to know whose history it is.
    if (p.tier !== 'paid' || !p.bia_id) return send(res, 200, { ok: true, history: false, pass_mark: PASS_MARK, attempts: [] });

    const rows = await history.attemptsForStudent(p.bia_id);
    send(res, 200, {
      ok: true, history: true, pass_mark: PASS_MARK,
      attempts: (rows || []).filter((r) => r.quizzes).map((r) => ({
        id: r.id, quiz: r.quizzes.code, title: r.quizzes.title, subject: r.quizzes.subject, programme: r.quizzes.programme,
        mode: r.mode, score: r.score, total: r.total, percent: r.total ? Math.round(r.score / r.total * 100) : 0,
        seconds_taken: r.seconds_taken || 0, tab_switches: r.tab_switches || 0, reason: r.reason || 'submitted', at: r.submitted_at
      }))
    });
  } catch (e) {
    console.error('my-results', e);
    send(res, 500, { ok: false, error: 'Could not load your results.' });
  }
};
