'use strict';
/* ALL staff routes live in this one function (Vercel's free plan limits how many functions you can have).
   The admin page calls  /api/admin?r=/some/route  and this file picks the right handler. */
const crypto = require('crypto');
const data = require('./_lib/admin-data');
const settings = require('./_lib/settings');
const milo = require('./_lib/milo');
const stats = require('./_lib/stats');
const { send, body, sign, auth, limit, KEYS } = require('./_lib/util');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
const fail = (res, msg) => send(res, 200, { ok: false, error: msg });

function sameCode(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function checkCfg(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'Missing quiz details.';
  if (!clean(cfg.title) || clean(cfg.title).length > 90) return 'Give the quiz a title (up to 90 characters).';
  if (!clean(cfg.subject) || clean(cfg.subject).length > 60) return 'Choose or type a subject.';
  if (['JUPEB', 'JAMB'].indexOf(cfg.programme) < 0) return 'Choose JUPEB or JAMB.';
  if (['practice', 'test'].indexOf(cfg.mode) < 0) return 'Choose Practice or Test.';
  const m = cfg.mix || {}; if ((+m.calc || 0) + (+m.theory || 0) + (+m.app || 0) !== 100) return 'The question mix must add up to 100%.';
  return '';
}

const routes = [];
const on = (method, re, fn) => routes.push({ method, re, fn });

/* ---------- sign in ---------- */
async function login(req, res) {
  if (!limit(req, 'staff-login', 8, 60000)) return send(res, 429, { ok: false, error: 'Too many attempts. Wait a minute and try again.' });
  const expected = process.env.STAFF_CODE;
  if (!expected || expected.length < 6) return fail(res, 'The staff code is not set up yet. Add STAFF_CODE in Vercel.');
  const code = String(body(req).code || '');
  if (!code || !sameCode(code, expected)) return fail(res, 'That code is not correct.');
  send(res, 200, { ok: true, token: sign({ role: 'admin', exp: Date.now() + 12 * 3600 * 1000 }) });
}

/* ---------- dashboard, lists, statistics ---------- */
on('GET', /^\/stats$/, async (req, res, m, q) => {
  const range = ['year', '30d', '7d'].indexOf(q.get('range')) > -1 ? q.get('range') : 'year';
  const [quizzes, attempts, students, st] = await Promise.all([data.listQuizzes(), data.allAttempts(), data.listStudents(), settings.getSettings()]);
  send(res, 200, stats.dashboard({ range, quizzes, attempts, students, passMark: st.pass_mark }));
});

on('GET', /^\/quizzes$/, async (req, res) => {
  const [quizzes, attempts] = await Promise.all([data.listQuizzes(), data.allAttempts()]);
  const per = {}; attempts.filter((a) => a.status === 'submitted').forEach((a) => { (per[a.quiz_id] = per[a.quiz_id] || []).push(stats.pct(a)); });
  send(res, 200, { ok: true, quizzes: quizzes.map((z) => ({ id: z.id, code: z.code, title: z.title, subject: z.subject, programme: z.programme, mode: z.mode, questions: Math.min(z.per_student, z.pool), pool: z.pool, attempts: (per[z.id] || []).length, avg: stats.avgOf(per[z.id] || []), open: z.open })) });
});

on('POST', /^\/quizzes\/([^/]+)\/status$/, async (req, res, m) => {
  if (!UUID.test(m[1])) return fail(res, 'Quiz not found.');
  const row = await data.setQuizOpen(m[1], !!body(req).open);
  send(res, 200, row ? { ok: true } : { ok: false, error: 'Quiz not found.' });
});

on('GET', /^\/quizzes\/([^/]+)\/stats$/, async (req, res, m) => {
  if (!UUID.test(m[1])) return fail(res, 'Quiz not found.');
  const quiz = await data.getQuiz(m[1]); if (!quiz) return fail(res, 'Quiz not found.');
  const [questions, attempts, st] = await Promise.all([data.listQuestions(quiz.id), data.quizAttemptsFull(quiz.id), settings.getSettings()]);
  send(res, 200, stats.quizStats({ quiz, questions, attempts, passMark: st.pass_mark }));
});

on('GET', /^\/results$/, async (req, res) => {
  const rows = await data.submittedAttempts(1000);
  send(res, 200, { ok: true, results: rows.map((a) => ({ name: a.student_name, bia_id: a.bia_id || '', tier: a.tier, quiz: a.quizzes ? a.quizzes.title : '', mode: a.mode, score: a.score, total: a.total, seconds: a.seconds_taken || 0, tab_switches: a.tab_switches || 0, reason: a.reason || 'submitted', at: new Date(a.submitted_at).getTime() })) });
});

on('GET', /^\/candidate$/, async (req, res, m, q) => {
  const bia = q.get('bia_id'), name = clean(q.get('name'));
  const st = await settings.getSettings();
  if (bia) {
    const s = await data.getStudent(String(bia).replace(/\D/g, '').padStart(4, '0')); if (!s) return fail(res, 'Candidate not found.');
    const rows = await data.attemptsByBia(s.bia_id);
    return send(res, 200, { ok: true, pass_mark: st.pass_mark, candidate: { name: s.name, bia_id: s.bia_id, tier: 'paid', active: s.active, added: new Date(s.created_at).getTime() }, attempts: rows.map(attemptRow) });
  }
  if (!name) return fail(res, 'Candidate not found.');
  const rows = await data.attemptsByFreeName(name);
  if (!rows.length) return fail(res, 'Candidate not found.');
  send(res, 200, { ok: true, pass_mark: st.pass_mark, candidate: { name: rows[0].student_name, bia_id: '', tier: 'free', active: true, added: null }, attempts: rows.map(attemptRow) });
});
const attemptRow = (a) => ({ quiz: a.quizzes ? a.quizzes.title : '', mode: a.mode, score: a.score, total: a.total, seconds: a.seconds_taken || 0, tab_switches: a.tab_switches || 0, reason: a.reason || 'submitted', at: new Date(a.submitted_at).getTime() });

/* ---------- students and BIA IDs ---------- */
on('GET', /^\/students$/, async (req, res) => {
  const [students, attempts] = await Promise.all([data.listStudents(), data.allAttempts()]);
  const n = {}; attempts.filter((a) => a.status === 'submitted' && a.bia_id).forEach((a) => { n[a.bia_id] = (n[a.bia_id] || 0) + 1; });
  send(res, 200, { ok: true, students: students.map((s) => ({ bia_id: s.bia_id, name: s.name, added: new Date(s.created_at).getTime(), attempts: n[s.bia_id] || 0, active: s.active })) });
});
on('POST', /^\/students$/, async (req, res) => {
  const name = clean(body(req).name);
  if (name.length < 5 || name.length > 80 || name.split(' ').length < 2) return fail(res, 'Enter the full name (first and last name).');
  const s = await data.insertStudent(name);
  send(res, 200, { ok: true, student: { bia_id: s.bia_id, name: s.name } });
});
on('POST', /^\/students\/bulk$/, async (req, res) => {
  const names = (Array.isArray(body(req).names) ? body(req).names : []).map(clean).filter(Boolean);
  if (!names.length || names.length > 100) return fail(res, 'Send between 1 and 100 names.');
  if (names.some((n) => n.length < 5 || n.length > 80 || n.split(' ').length < 2)) return fail(res, 'Every name needs a first and last name.');
  const rows = await data.insertStudents(names);
  send(res, 200, { ok: true, students: rows.map((s) => ({ bia_id: s.bia_id, name: s.name })) });
});
on('POST', /^\/students\/(\d{1,6})\/active$/, async (req, res, m) => {
  const row = await data.setStudentActive(m[1].padStart(4, '0'), !!body(req).active);
  send(res, 200, row ? { ok: true } : { ok: false, error: 'Student not found.' });
});

/* ---------- settings ---------- */
on('GET', /^\/settings$/, async (req, res) => { send(res, 200, Object.assign({ ok: true }, await settings.getSettings())); });
on('POST', /^\/settings$/, async (req, res) => { const b = body(req); send(res, 200, Object.assign({ ok: true }, await settings.saveSettings({ tab_limit: b.tab_limit, pass_mark: b.pass_mark }))); });

/* ---------- Milo ---------- */
on('POST', /^\/generate$/, async (req, res) => {
  if (!limit(req, 'milo', 40, 60000)) return fail(res, 'Slow down a little. Try again in a minute.');
  const b = body(req), bad = checkCfg(b.cfg); if (bad) return fail(res, bad);
  const size = Math.max(1, Math.min(10, parseInt(b.size, 10) || 1)), start = Math.max(0, parseInt(b.start_index, 10) || 0);
  const avoid = (Array.isArray(b.avoid) ? b.avoid : []).slice(-80).map((s) => String(s).slice(0, 120));
  const questions = await milo.generate({ cfg: b.cfg, size, startIndex: start, avoid });
  send(res, 200, { ok: true, questions });
});

on('POST', /^\/refine$/, async (req, res) => {
  if (!limit(req, 'milo', 40, 60000)) return fail(res, 'Slow down a little. Try again in a minute.');
  const b = body(req), bad = checkCfg(b.cfg); if (bad) return fail(res, bad);
  const instruction = String(b.instruction || '').trim(); if (!instruction) return fail(res, 'Type what you want changed.');
  const qs = Array.isArray(b.questions) ? b.questions.slice(0, 300) : []; if (!qs.length) return fail(res, 'There are no questions to change yet.');
  const questions = qs.map((q) => ({ text: String(q.text || ''), options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => String(o)), answer: KEYS.indexOf(q.answer) > -1 ? q.answer : 'A', explanation: String(q.explanation || ''), type: q.type }));
  const out = await milo.refine({ cfg: b.cfg, instruction, history: Array.isArray(b.history) ? b.history : [], questions });
  send(res, 200, { ok: true, reply: out.reply, ops: out.ops });
});

/* ---------- publish ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

on('POST', /^\/publish$/, async (req, res) => {
  const b = body(req), cfg = b.cfg, bad = checkCfg(cfg); if (bad) return fail(res, bad);
  const qs = Array.isArray(b.questions) ? b.questions : [];
  if (qs.length < 1 || qs.length > 300) return fail(res, 'A quiz needs between 1 and 300 questions.');
  const rows = [];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], opts = Array.isArray(q.options) ? q.options.map((o) => String(o && o.text != null ? o.text : o || '').trim()) : [];
    if (!String(q.text || '').trim() || opts.length !== 4 || opts.some((o) => !o) || KEYS.indexOf(q.answer) < 0) return fail(res, 'Question ' + (i + 1) + ' is not complete. Every question needs text, 4 options and a correct answer.');
    rows.push({ position: i + 1, text: String(q.text).trim(), options: opts.map((t, j) => ({ key: KEYS[j], text: t })), answer: q.answer, explanation: String(q.explanation || '').trim(), qtype: ['calculation', 'theory', 'application'].indexOf(q.type) > -1 ? q.type : 'calculation' });
  }
  const per = Math.max(1, Math.min(parseInt(cfg.perStudent, 10) || rows.length, rows.length));
  const minutes = cfg.mode === 'test' ? Math.max(1, Math.min(300, parseInt(cfg.duration, 10) || 30)) : 0;
  let code = '', tries = 0; do { code = makeCode(); tries++; } while (await data.codeExists(code) && tries < 8);
  const quiz = await data.insertQuiz({ code, title: clean(cfg.title), subject: clean(cfg.subject), programme: cfg.programme, mode: cfg.mode, duration_minutes: minutes, per_student: per, shuffle_options: cfg.shuffle !== false, open: true });
  try { await data.insertQuestions(rows.map((r) => Object.assign({ quiz_id: quiz.id }, r))); }
  catch (e) { await data.deleteQuiz(quiz.id).catch(() => {}); throw e; }          // never leave a quiz with missing questions
  send(res, 200, { ok: true, code: quiz.code });
});

module.exports = async (req, res) => {
  try {
    const r = String((req.query && req.query.r) || ''), qi = r.indexOf('?');
    const path = (qi < 0 ? r : r.slice(0, qi)).replace(/\/+$/, '') || '/', q = new URLSearchParams(qi < 0 ? '' : r.slice(qi + 1));

    if (path === '/login' && req.method === 'POST') return await login(req, res);

    const p = auth(req, res); if (!p) return;
    if (p.role !== 'admin') return send(res, 401, { ok: false, error: 'Please sign in again.' });

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const m = path.match(route.re); if (!m) continue;
      return await route.fn(req, res, m, q);
    }
    send(res, 404, { ok: false, error: 'Unknown route.' });
  } catch (e) {
    if (e instanceof milo.MiloError) return send(res, 200, { ok: false, error: e.message });
    console.error('admin', e);
    send(res, 500, { ok: false, error: 'Something went wrong on the server. Please try again.' });
  }
};
