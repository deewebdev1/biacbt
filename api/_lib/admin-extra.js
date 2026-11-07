'use strict';
/* Extra admin database actions (kept in their own file so nothing else changes):
   list test attempts, reset one test attempt, delete a candidate. */
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

exports.listTestAttempts = () => run(client().from('attempts')
  .select('id,student_name,bia_id,tier,status,score,total,started_at,submitted_at,device_id,quizzes(title)')
  .eq('mode', 'test').order('started_at', { ascending: false }).limit(300));

/* Removes ONE test attempt. Deleting it also lifts the name and device lock for that test. */
exports.resetAttempt = async (id) => {
  const rows = await run(client().from('attempts').delete().eq('id', id).eq('mode', 'test').select('id'));
  return rows ? rows.length : 0;
};

exports.attemptCountForStudent = async (biaId) => {
  const { count, error } = await client().from('attempts').select('id', { count: 'exact', head: true }).eq('bia_id', biaId);
  if (error) throw error;
  return count || 0;
};

/* Removes one candidate and that candidate's own attempts. Nobody else's data is touched. */
exports.deleteStudent = async (biaId) => {
  await run(client().from('attempts').delete().eq('bia_id', biaId));
  const rows = await run(client().from('students').delete().eq('bia_id', biaId).select('bia_id'));
  return rows ? rows.length : 0;
};

/* Updates an existing candidate's name (and phone, when one is given). The BIA ID never changes. */
exports.updateStudent = async (biaId, name, phone) => {
  const patch = { name };
  if (phone) patch.phone = phone;
  const rows = await run(client().from('students').update(patch).eq('bia_id', biaId).select('bia_id'));
  return rows ? rows.length : 0;
};
