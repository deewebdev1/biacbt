'use strict';
const { view, KEYS } = require('./util');

/* Builds the result the results page shows. `orders` maps question id -> original keys in the order the student saw. */
function buildResult(quiz, byId, ids, orders, answers, extra) {
  let score = 0;
  const rows = ids.map((id) => {
    const q = byId[id]; if (!q) return null;
    const order = orders[id] || KEYS;
    const shown = view(q, order, true);
    const chosen = KEYS.indexOf(answers[id]) > -1 ? answers[id] : null;
    const correct = chosen !== null && order[KEYS.indexOf(chosen)] === q.answer;
    if (correct) score++;
    return { id: q.id, text: q.text, options: shown.options, chosen, answer: shown.answer, correct, explanation: shown.explanation };
  }).filter(Boolean);
  const total = rows.length;
  return Object.assign({ quiz: quiz.code, title: quiz.title, mode: quiz.mode, score, total, percent: total ? Math.round(score / total * 100) : 0, rows }, extra);
}

module.exports = { buildResult };
