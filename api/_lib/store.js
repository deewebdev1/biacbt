'use strict';
/* All database access lives here. Handlers never talk to Supabase directly. */
const { createClient } = require('@supabase/supabase-js');

let db;
function client() {
  if (!db) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('Supabase environment variables are missing');
    db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  }
  return db;
}
async function run(q) { const { data, error } = await q; if (error) throw error; return data; }

exports.getQuizByCode = (code) => run(client().from('quizzes').select('*').eq('code', code).maybeSingle());

exports.listOpenQuizzes = async () => {
  const rows = await run(client().from('quizzes').select('*, questions(count)').eq('open', true).order('created_at', { ascending: false }));
  return (rows || []).map((r) => Object.assign({}, r, { pool: r.questions && r.questions[0] ? r.questions[0].count : 0 }));
};

exports.getQuestions = (quizId) => run(client().from('questions').select('*').eq('quiz_id', quizId).order('position', { ascending: true }));

exports.getStudent = (biaId) => run(client().from('students').select('*').eq('bia_id', biaId).eq('active', true).maybeSingle());

exports.findTestAttempt = (quizId, biaId) => run(client().from('attempts').select('*').eq('quiz_id', quizId).eq('bia_id', biaId).eq('mode', 'test').maybeSingle());

exports.testAttemptsForStudent = (biaId) => run(client().from('attempts').select('quiz_id,status,score,total').eq('bia_id', biaId).eq('mode', 'test'));

/* Free-class students have no BIA ID, so their test attempts are found by the name key instead. */
exports.findTestAttemptByKey = (quizId, key) => run(client().from('attempts').select('*').eq('quiz_id', quizId).eq('student_key', key).eq('mode', 'test').maybeSingle());

exports.testAttemptsForKey = (key) => run(client().from('attempts').select('quiz_id,status,score,total').eq('student_key', key).eq('mode', 'test'));

exports.createAttempt = async (row) => {
  const { data, error } = await client().from('attempts').insert(row).select().single();
  if (error) throw error;
  return data;
};

/* Closes an attempt only if it is still in progress, so a double submit cannot score twice. Returns null if already closed. */
exports.closeAttempt = (id, patch) => run(client().from('attempts').update(patch).eq('id', id).eq('status', 'in_progress').select().maybeSingle());
