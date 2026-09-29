// Semua tampilan waktu dipaksa ke WIB (Asia/Jakarta, +07:00), apa pun zona perangkat tamu.
const TZ = 'Asia/Jakarta';

// Formatter Intl mahal dibuat (±50ms di HP low-end) → dibuat saat pertama dipakai.
const lazy = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

const dateFmt = lazy(
  () => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
);
const shortDateFmt = lazy(
  () => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }),
);
const timeFmt = lazy(
  () => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }),
);
const rtf = lazy(() => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }));

const toDate = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);
const hhmm = (v: string | Date) => timeFmt().format(toDate(v));

/** "Sabtu, 12 Desember 2026" */
export const formatDate = (v: string | Date) => dateFmt().format(toDate(v));

/** "12.12.2026" untuk hero */
export const formatShortDate = (v: string | Date) => shortDateFmt().format(toDate(v)).replaceAll('/', '.');

/** "11:00 AM WIB" */
export const formatTime = (v: string | Date) => `${hhmm(v)} WIB`;

/** "11:00 AM – 2:00 PM WIB" */
export const formatTimeRange = (start: string | Date, end?: string | Date | null) =>
  end ? `${hhmm(start)} – ${formatTime(end)}` : `${formatTime(start)} onwards`;

/** "Saturday, December 12, 2026, 11:00 AM WIB" */
export const formatDateTime = (v: string | Date) => `${formatDate(v)}, ${formatTime(v)}`;

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "2 hours ago", "just now" */
export function formatRelative(v: string | Date, now = Date.now()): string {
  const diff = Math.round((toDate(v).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  for (const [unit, secs] of UNITS) {
    if (abs >= secs || unit === 'minute') {
      return rtf().format(Math.round(diff / secs), unit);
    }
  }
  return 'just now';
}
