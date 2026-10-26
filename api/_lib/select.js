'use strict';
/* Picks the questions one student gets, keeping the mix the admin asked for (for example 50% calculation,
   30% theory, 20% application). Whole numbers are worked out with the largest-remainder rule. */
const { shuffle } = require('./util');
const TYPES = ['calculation', 'theory', 'application'];

/* How many of each type for n questions. mix is { calculation, theory, application } in percent. */
function targets(mix, n) {
  const m = {}; let tot = 0;
  TYPES.forEach((t) => { m[t] = Math.max(0, +(mix && mix[t]) || 0); tot += m[t]; });
  if (!tot) return null;
  const out = {}, rem = []; let used = 0;
  TYPES.forEach((t) => { const raw = n * m[t] / tot; out[t] = Math.floor(raw); used += out[t]; rem.push({ t, f: raw - out[t], p: m[t] }); });
  rem.sort((a, b) => (b.f - a.f) || (b.p - a.p));
  for (let i = 0; used < n; i++, used++) out[rem[i % 3].t]++;
  return out;
}

/* pool: question rows with `qtype`. Returns n questions in a random order. */
function pickQuestions(pool, n, mix) {
  n = Math.min(n, pool.length);
  const want = targets(mix, n);
  if (!want) return shuffle(pool).slice(0, n);
  const by = {}; TYPES.forEach((t) => { by[t] = []; });
  shuffle(pool).forEach((q) => { by[TYPES.indexOf(q.qtype) > -1 ? q.qtype : 'calculation'].push(q); });
  const chosen = [];
  TYPES.forEach((t) => { chosen.push.apply(chosen, by[t].splice(0, want[t])); });
  if (chosen.length < n) {                              // a type ran short: fill from whatever is left
    const rest = shuffle([].concat(by.calculation, by.theory, by.application));
    chosen.push.apply(chosen, rest.slice(0, n - chosen.length));
  }
  return shuffle(chosen);
}

module.exports = { targets, pickQuestions, TYPES };
