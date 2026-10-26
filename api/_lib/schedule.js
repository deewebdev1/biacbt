'use strict';
/* Quiz schedule: opens_at and closes_at are optional. Times are shown in Nigeria time (WAT). */
const fmt = (ts) => new Date(ts).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const t = (x) => (x ? new Date(x).getTime() : 0);

/* 'upcoming' (not open yet), 'open', or 'closed' (switched off by staff, or past its closing time) */
function stateOf(q, now) {
  now = now || Date.now();
  const o = t(q.opens_at), c = t(q.closes_at);
  if (!q.open) return 'closed';
  if (o && now < o) return 'upcoming';
  if (c && now >= c) return 'closed';
  return 'open';
}

/* The message a student sees when they cannot start. Empty string means they can. */
function blockedMessage(q, now) {
  const s = stateOf(q, now);
  if (s === 'upcoming') return 'This quiz opens on ' + fmt(t(q.opens_at)) + ' (Nigeria time).';
  if (s === 'closed') return q.open && q.closes_at ? 'This quiz closed on ' + fmt(t(q.closes_at)) + '.' : 'This quiz has been closed.';
  return '';
}

/* Reads and checks a schedule from the admin. Returns { opens, closes } as ISO strings or null, or { error }. */
function parseSchedule(opens, closes, now) {
  now = now || Date.now();
  const read = (v) => { if (v === null || v === undefined || v === '') return null; const d = new Date(v); return isNaN(d) ? undefined : d; };
  const o = read(opens), c = read(closes);
  if (o === undefined || c === undefined) return { error: 'One of the dates is not valid.' };
  if (o && c && c <= o) return { error: 'The closing time must be after the opening time.' };
  if (c && c.getTime() <= now) return { error: 'The closing time is already in the past.' };
  return { opens: o ? o.toISOString() : null, closes: c ? c.toISOString() : null };
}

module.exports = { stateOf, blockedMessage, parseSchedule, fmt };
    
