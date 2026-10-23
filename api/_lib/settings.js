'use strict';
/* Platform settings (tab-switch limit, pass mark), stored in the `settings` table. Never throws:
   if the table is missing or the database is down, the defaults are used. */
const { createClient } = require('@supabase/supabase-js');

const DEFAULTS = { tab_limit: 3, pass_mark: 50 };
let db, cache = null, cacheAt = 0;

function client() {
  if (!db) db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return db;
}
function clean(raw) {
  const out = Object.assign({}, DEFAULTS);
  const t = parseInt(raw && raw.tab_limit, 10); if (t >= 1 && t <= 10) out.tab_limit = t;
  const p = parseInt(raw && raw.pass_mark, 10); if (p >= 1 && p <= 100) out.pass_mark = p;
  return out;
}

async function getSettings() {
  if (cache && Date.now() - cacheAt < 20000) return cache;
  try {
    const { data, error } = await client().from('settings').select('key,value');
    if (error) throw error;
    const raw = {}; (data || []).forEach((r) => { raw[r.key] = r.value; });
    cache = clean(raw);
  } catch (e) {
    console.error('settings:', e && e.message);
    cache = cache || Object.assign({}, DEFAULTS);
  }
  cacheAt = Date.now();
  return cache;
}

async function saveSettings(patch) {
  const s = clean(patch);
  const { error } = await client().from('settings').upsert([{ key: 'tab_limit', value: s.tab_limit }, { key: 'pass_mark', value: s.pass_mark }]);
  if (error) throw error;
  cache = null;
  return getSettings();
}

module.exports = { getSettings, saveSettings, DEFAULTS };
