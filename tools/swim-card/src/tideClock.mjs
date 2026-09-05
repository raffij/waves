// London-time helpers. A standalone port of the ideas in
// expo/src/services/TideClock.ts (parsing Open-Meteo/TideCheck's
// offset-less "local" timestamps as Europe/London wall-clock time) — kept
// as its own small implementation rather than imported, matching this
// repo's convention of no shared code between independent clients.

const LONDON_TZ = 'Europe/London';

function partsOf(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

// Milliseconds to add to a UTC timestamp to get London wall-clock time (handles BST).
function offsetMillis(date) {
  const p = partsOf(date);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// Parses "yyyy-MM-ddTHH:mm[:ss]" with no timezone offset as Europe/London
// wall-clock time, so it lands on the right instant regardless of the host
// machine's own timezone. A string that already carries an offset/"Z" is
// parsed as-is.
export function parseLondonWallTime(value) {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, s] = m;
  const asUTC = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  const offset = offsetMillis(new Date(asUTC));
  return new Date(asUTC - offset);
}

export function formatLondon(date, options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: LONDON_TZ, ...options }).format(date);
}

export function londonHour(date) {
  return Number(formatLondon(date, { hour: '2-digit', hour12: false }));
}

// "BST" in summer, "GMT" in winter — Europe/London's offset is +60min
// exactly when British Summer Time is in effect, 0 otherwise.
export function londonTimeZoneAbbreviation(date) {
  return offsetMillis(date) === 60 * 60 * 1000 ? 'BST' : 'GMT';
}

// yyyy-MM-dd for the given instant, evaluated in London local time — matches
// the "yyyy-MM-dd" keys Open-Meteo's `daily` block uses for sunrise/sunset.
export function londonDateKey(date) {
  const p = partsOf(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// Inverse of parseLondonWallTime: renders `date` as the offset-less
// "yyyy-MM-ddTHH:mm" string that, read back through parseLondonWallTime,
// reproduces the same instant. Only needed for building synthetic fixtures
// (sampleData.mjs) in the same shape TideCheck/Open-Meteo's own timestamps use.
export function formatLondonWallTimeString(date) {
  const p = partsOf(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
