// The API speaks epoch milliseconds; the business rules are in IST (UTC+05:30, no DST).
// The UI shows and accepts every instant in IST, whatever the browser's own time zone is.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const istFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** 1783312500000 -> "06 Jul, 10:05:00" (IST) */
export function formatIst(ms) {
  return ms == null ? '—' : istFormatter.format(new Date(ms));
}

/** "2026-07-06T10:05" typed as IST -> epoch ms. Empty -> undefined (the API then uses "now"). */
export function istInputToMs(value) {
  if (!value) return undefined;
  const [d, t] = value.split('T');
  const [y, mo, day] = d.split('-').map(Number);
  const [h, mi, s = 0] = t.split(':').map(Number);
  return Date.UTC(y, mo - 1, day, h, mi, s) - IST_OFFSET_MS;
}

/** epoch ms -> "2026-07-06T10:05:00" in IST, for a datetime-local input (seconds kept, the API stores them). */
export function msToIstInput(ms) {
  if (ms == null) return '';
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19);
}

/** Today's IST date / month, as the API expects them. */
export function todayIst() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function currentMonthIst() {
  return todayIst().slice(0, 7);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const formatPct = (rate) => (rate == null ? '—' : `${(rate * 100).toFixed(2)}%`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03" -> "March 2026" */
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "2026-03-02" -> "02 Mar 2026, Mon" */
export function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${day}`;
}

/** epoch ms -> "10:05:00" IST (time only). */
export function formatIstTime(ms) {
  if (ms == null) return '—';
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(11, 19);
}

/** "Asha Rao" -> "AR", "Employee 374" -> "E3". */
export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';
