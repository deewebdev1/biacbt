'use strict';
/* Pure functions that turn rows into the numbers the admin pages show. No database or network in here. */
const KEYS = ['A', 'B', 'C', 'D'];
const DAY = 86400000;

const pct = (a) => (a && a.total ? Math.round(a.score / a.total * 100) : 0);
const avgOf = (arr) => (arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : 0);
function median(arr) { const s = arr.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)) : 0; }
function bandsOf(pcts) { const b = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; pcts.forEach((p) => { b[Math.min(9, Math.floor(p / 10))]++; }); return b; }
const delta = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : Math.round((curr - prev) / prev * 100));
const ms = (x) => (x ? new Date(x).getTime() : 0);

/* attempts: rows with { status, mode, score, total, reason, tab_switches, started_at, submitted_at, student_name, bia_id, quizzes:{title,subject,programme} } */
function dashboard({ range, quizzes, attempts, students, passMark, now }) {
  now = now || Date.now();
  const done = attempts.filter((a) => a.status === 'submitted');
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
  const inRange = (t, from, to) => t >= from && t < to;
  const curFrom = now - days * DAY, prevFrom = now - 2 * days * DAY;

  const doneCur = done.filter((a) => inRange(ms(a.submitted_at), curFrom, now + 1)), donePrev = done.filter((a) => inRange(ms(a.submitted_at), prevFrom, curFrom));
  const allPcts = done.map(pct), curPcts = doneCur.map(pct), prevPcts = donePrev.map(pct);
  const passRate = (arr) => (arr.length ? Math.round(arr.filter((p) => p >= passMark).length / arr.length * 100) : 0);

  // chart buckets
  const labels = [], started = [], finished = [];
  if (range === 'year') {
    const y = new Date(now).getFullYear(), names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 0; m < 12; m++) { labels.push(names[m]); started.push(0); finished.push(0); }
    attempts.forEach((a) => { const d = new Date(ms(a.started_at)); if (d.getFullYear() === y) started[d.getMonth()]++; });
    done.forEach((a) => { const d = new Date(ms(a.submitted_at)); if (d.getFullYear() === y) finished[d.getMonth()]++; });
  } else {
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0); const t0 = startOfToday.getTime();
    for (let i = days - 1; i >= 0; i--) { const d = new Date(t0 - i * DAY); labels.push(days === 7 ? d.toLocaleString('en', { weekday: 'short' }) : d.getDate() + ' ' + d.toLocaleString('en', { month: 'short' })); started.push(0); finished.push(0); }
    const idx = (t) => { const i = days - 1 - Math.floor((t0 - new Date(t).setHours(0, 0, 0, 0)) / DAY); return i; };
    attempts.forEach((a) => { const i = idx(ms(a.started_at)); if (i >= 0 && i < days) started[i]++; });
    done.forEach((a) => { const i = idx(ms(a.submitted_at)); if (i >= 0 && i < days) finished[i]++; });
  }

  // subjects, sources, top quizzes
  const bySubject = {}; done.forEach((a) => { const s = a.quizzes && a.quizzes.subject; if (s) bySubject[s] = (bySubject[s] || 0) + 1; });
  const subjects = Object.keys(bySubject).map((n) => ({ name: n, count: bySubject[n] })).sort((a, b) => b.count - a.count).slice(0, 5);
  const bySource = {}; done.forEach((a) => { if (!a.quizzes) return; const k = a.quizzes.programme + ' ' + (a.mode === 'test' ? 'Test' : 'Practice'); bySource[k] = (bySource[k] || 0) + 1; });
  const sources = Object.keys(bySource).map((l) => ({ label: l, pct: Math.round(bySource[l] / (done.length || 1) * 100) })).sort((a, b) => b.pct - a.pct).slice(0, 4);
  const perQuiz = {}; done.forEach((a) => { if (!a.quizzes) return; const k = a.quizzes.title; (perQuiz[k] = perQuiz[k] || []).push(pct(a)); });
  const top = Object.keys(perQuiz).map((t) => ({ title: t, avg: avgOf(perQuiz[t]) })).sort((a, b) => b.avg - a.avg).slice(0, 6);

  // recent activity
  const ev = [];
  done.slice().sort((a, b) => ms(b.submitted_at) - ms(a.submitted_at)).slice(0, 6).forEach((a) => ev.push({ kind: 'attempt', text: a.student_name + ' finished ' + (a.quizzes ? a.quizzes.title : 'a quiz'), time: ms(a.submitted_at), tag: pct(a) + '%' }));
  quizzes.slice().sort((a, b) => ms(b.created_at) - ms(a.created_at)).slice(0, 4).forEach((q) => ev.push({ kind: 'publish', text: 'Quiz published: ' + q.title, time: ms(q.created_at), tag: q.mode === 'test' ? 'Test' : 'Practice' }));
  students.slice().sort((a, b) => ms(b.created_at) - ms(a.created_at)).slice(0, 4).forEach((s) => ev.push({ kind: 'student', text: 'New student added: ' + s.name, time: ms(s.created_at), tag: s.bia_id }));
  ev.sort((a, b) => b.time - a.time);

  const sub = { on_time: done.filter((a) => a.reason === 'submitted' || !a.reason).length, late: done.filter((a) => a.reason === 'time_up').length, auto_tab: done.filter((a) => a.reason === 'tab_switch').length, not_submitted: attempts.filter((a) => a.status !== 'submitted').length };
  const quizzesCur = quizzes.filter((q) => inRange(ms(q.created_at), curFrom, now + 1)).length, quizzesPrev = quizzes.filter((q) => inRange(ms(q.created_at), prevFrom, curFrom)).length;

  return {
    ok: true, pass_mark: passMark,
    kpis: { quizzes: quizzes.length, attempts: done.length, avg: avgOf(allPcts), completion: attempts.length ? Math.round(done.length / attempts.length * 100) : 0, pass_rate: passRate(allPcts),
      d_quizzes: delta(quizzesCur, quizzesPrev), d_attempts: delta(doneCur.length, donePrev.length), d_avg: avgOf(curPcts) - avgOf(prevPcts), d_pass_rate: passRate(curPcts) - passRate(prevPcts) },
    labels, attempts: started, completed: finished, subjects, sources, top, recent: ev.slice(0, 6), bands: bandsOf(allPcts), submission: sub
  };
}

/* One quiz. `attempts` are ALL attempts for the quiz, with answers/option_orders/question_ids. `questions` are the quiz questions in order. */
function quizStats({ quiz, questions, attempts, passMark }) {
  const done = attempts.filter((a) => a.status === 'submitted'), pcts = done.map(pct), n = done.length || 1;
  const passed = pcts.filter((p) => p >= passMark).length, ge70 = pcts.filter((p) => p >= 70).length;

  const byId = {}; questions.forEach((q, i) => { byId[q.id] = { q, n: i + 1, right: 0, seen: 0 }; });
  done.forEach((a) => {
    (a.question_ids || []).forEach((id) => {
      const rec = byId[id]; if (!rec) return; rec.seen++;
      const chosen = a.answers && a.answers[id]; if (KEYS.indexOf(chosen) < 0) return;
      const order = (a.option_orders && a.option_orders[id]) || KEYS;
      if (order[KEYS.indexOf(chosen)] === rec.q.answer) rec.right++;
    });
  });
  const qs = Object.keys(byId).map((id) => byId[id]).filter((r) => r.seen > 0).map((r) => ({ n: r.n, text: r.q.text, pct_correct: Math.round(r.right / r.seen * 100) })).sort((a, b) => a.pct_correct - b.pct_correct);

  const started = attempts.length;
  return {
    ok: true, pass_mark: passMark,
    quiz: { id: quiz.id, code: quiz.code, title: quiz.title, subject: quiz.subject, programme: quiz.programme, mode: quiz.mode, questions: Math.min(quiz.per_student, questions.length), duration_minutes: quiz.mode === 'test' ? (quiz.duration_minutes || 30) : 0, open: quiz.open },
    totals: {
      started, submitted: done.length, in_progress: started - done.length,
      on_time: done.filter((a) => a.reason === 'submitted' || !a.reason).length, late: done.filter((a) => a.reason === 'time_up').length, auto_tab: done.filter((a) => a.reason === 'tab_switch').length,
      avg: avgOf(pcts), median: median(pcts), best: pcts.length ? Math.max.apply(null, pcts) : 0, worst: pcts.length ? Math.min.apply(null, pcts) : 0,
      avg_seconds: Math.round(done.reduce((x, a) => x + (a.seconds_taken || 0), 0) / n),
      passed, failed: done.length - passed, pass_pct: done.length ? Math.round(passed / n * 100) : 0, fail_pct: done.length ? 100 - Math.round(passed / n * 100) : 0, ge70, ge70_pct: done.length ? Math.round(ge70 / n * 100) : 0,
      flagged: done.filter((a) => (a.tab_switches || 0) >= 2).length
    },
    bands: bandsOf(pcts), questions: qs,
    attempts: done.slice().sort((a, b) => ms(b.submitted_at) - ms(a.submitted_at)).slice(0, 60).map((a) => ({ name: a.student_name, bia_id: a.bia_id || '', tier: a.tier, score: a.score, total: a.total, seconds: a.seconds_taken || 0, tab_switches: a.tab_switches || 0, reason: a.reason || 'submitted', at: ms(a.submitted_at) }))
  };
}

module.exports = { dashboard, quizStats, pct, bandsOf, median, avgOf, delta };
