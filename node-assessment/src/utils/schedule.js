const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "14:30", "14:30:15", "2:30 PM", "02:30:00 am" -> { h, m, s }
function parseTime(time) {
  const match = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] || 0);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
  }
  if (h > 23 || m > 59 || s > 59) return null;
  return { h, m, s };
}

// day: a date ("2026-10-20") or a weekday name ("monday", next occurrence).
// time: see parseTime. Interpreted in the server's local timezone.
// Returns a Date, or throws with a message suitable for a 400 response.
function resolveRunAt(day, time, now = new Date()) {
  const t = parseTime(time);
  if (!t) throw new Error('"time" must look like HH:mm, HH:mm:ss or hh:mm AM/PM');

  const dayStr = String(day).trim().toLowerCase();
  const weekday = WEEKDAYS.indexOf(dayStr);
  let runAt;

  if (weekday !== -1) {
    runAt = new Date(now);
    runAt.setHours(t.h, t.m, t.s, 0);
    let diff = (weekday - now.getDay() + 7) % 7;
    if (diff === 0 && runAt <= now) diff = 7;
    runAt.setDate(runAt.getDate() + diff);
  } else {
    const match = dayStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('"day" must be a date (YYYY-MM-DD) or a weekday name such as "monday"');
    const [y, mo, d] = match.slice(1).map(Number);
    runAt = new Date(y, mo - 1, d, t.h, t.m, t.s, 0);
    if (runAt.getMonth() !== mo - 1 || runAt.getDate() !== d) throw new Error(`"${day}" is not a valid date`);
    if (runAt <= now) throw new Error('The given day and time is in the past');
  }
  return runAt;
}

module.exports = { resolveRunAt, parseTime };
