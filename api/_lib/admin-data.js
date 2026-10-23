'use strict';
/* Database queries for the admin area. Only the staff routes use this file. */
const { createClient } = require('@supabase/supabase-js');

let db;
function c() {
  if (!db) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('Supabase environment variables are missing');
    db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  }
  return db;
}
async function run(q) { const { data, error } = await q; if (error) throw error; return data; }

/* Supabase returns at most 1000 rows per request, so read in pages. */
async function pageAll(make, max) {
  const out = []; max = max || 10000;
  for (let from = 0; from < max; from += 1000) {
    const rows = await run(make().range(from, from + 999));
    out.push.apply(out, rows || []);
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

const LIGHT = 'id,quiz_id,tier,student_name,bia_id,mode,status,started_at,submitted_at,score,total,seconds_taken,tab_switches,reason,quizzes(code,title,subject,programme,mode)';

exports.listQuizzes = async () => {
  const rows = await pageAll(() => c().from('quizzes').select('*, questions(count)').order('created_at', { ascending: false }));
  return rows.map((r) => Object.assign({}, r, { pool: r.questions && r.questions[0] ? r.questions[0].count : 0 }));
};
exports.getQuiz = (id) => run(c().from('quizzes').select('*').eq('id', id).maybeSingle());
exports.codeExists = async (code) => !!(await run(c().from('quizzes').select('id').eq('code', code).maybeSingle()));
exports.listQuestions = (quizId) => pageAll(() => c().from('questions').select('*').eq('quiz_id', quizId).order('position', { ascending: true }));
exports.insertQuiz = async (row) => { const { data, error } = await c().from('quizzes').insert(row).select().single(); if (error) throw error; return data; };
exports.insertQuestions = async (rows) => { for (let i = 0; i < rows.length; i += 100) { const { error } = await c().from('questions').insert(rows.slice(i, i + 100)); if (error) throw error; } };
exports.deleteQuiz = (id) => run(c().from('quizzes').delete().eq('id', id));
exports.setQuizOpen = (id, open) => run(c().from('quizzes').update({ open }).eq('id', id).select().maybeSingle());

exports.allAttempts = () => pageAll(() => c().from('attempts').select(LIGHT).order('started_at', { ascending: false }));
exports.quizAttemptsFull = (quizId) => pageAll(() => c().from('attempts').select('*').eq('quiz_id', quizId));
exports.submittedAttempts = (limit) => run(c().from('attempts').select(LIGHT).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(limit || 1000));
exports.attemptsByBia = (bia) => run(c().from('attempts').select(LIGHT).eq('bia_id', bia).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(500));
exports.attemptsByFreeName = (name) => run(c().from('attempts').select(LIGHT).eq('tier', 'free').eq('status', 'submitted').ilike('student_name', name.replace(/[\\%_]/g, '\\$&')).order('submitted_at', { ascending: false }).limit(500));

exports.listStudents = () => pageAll(() => c().from('students').select('*').order('created_at', { ascending: false }));
exports.getStudent = (bia) => run(c().from('students').select('*').eq('bia_id', bia).maybeSingle());
exports.insertStudent = async (name) => { const { data, error } = await c().from('students').insert({ name }).select().single(); if (error) throw error; return data; };
exports.insertStudents = async (names) => { const out = []; for (const n of names) out.push(await exports.insertStudent(n)); return out; };   // one by one so IDs follow the order given
exports.setStudentActive = (bia, active) => run(c().from('students').update({ active }).eq('bia_id', bia).select().maybeSingle());
