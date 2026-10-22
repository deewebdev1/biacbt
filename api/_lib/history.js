'use strict';
/* Database access for a student's own results history. */
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

exports.attemptsForStudent = (biaId) => run(client().from('attempts')
  .select('id,mode,score,total,seconds_taken,tab_switches,reason,submitted_at,quizzes(code,title,subject,programme)')
  .eq('bia_id', biaId).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(100));

exports.getAttempt = (id) => run(client().from('attempts').select('*').eq('id', id).maybeSingle());
exports.getQuiz = (id) => run(client().from('quizzes').select('*').eq('id', id).maybeSingle());
exports.getQuestions = (quizId) => run(client().from('questions').select('*').eq('quiz_id', quizId));
