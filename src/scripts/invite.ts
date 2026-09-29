import { event } from '../config/event';
import { getGuest, type AkadInfo, type Guest } from '../lib/api';
import { formatDate, formatTimeRange } from '../lib/time';
import { googleCalendarUrl, icsContent } from '../lib/calendar';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { greetingName } from '../lib/greeting';

const root = document.documentElement;
const couple = event.coupleOrder.map((k) => event[k].panggilan).join(' & ');

// ---------------------------------------------------------------- cover

function initCover() {
  const cover = document.getElementById('cover');
  const openBtn = document.getElementById('open-invitation');
  const main = document.getElementById('main');
  if (!cover || !openBtn || !main) return;

  main.inert = true;
  window.scrollTo(0, 0);

  openBtn.addEventListener(
    'click',
    () => {
      root.classList.remove('is-locked');
      main.inert = false;
      window.scrollTo(0, 0);
      cover.style.transform = 'translateY(-100%)';
      // Harus di dalam handler klik supaya musik boleh autoplay.
      document.dispatchEvent(new CustomEvent('invitation:open'));

      const done = () => {
        cover.hidden = true;
        document.getElementById('hero')?.focus({ preventScroll: true });
      };
      cover.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 1300);
    },
    { once: true },
  );
}

// ---------------------------------------------------------------- tamu

const greetingFor = (guest: Guest | null) =>
  guest ? greetingName(guest.nama, guest.sapaan) : event.fallbackGuestName;

/** Hanya izinkan link http(s) dari DB (cegah javascript: URL). */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function renderAkad(akad: AkadInfo) {
  const card = document.querySelector<HTMLElement>('[data-akad-card]');
  if (!card) return;
  const field = <T extends HTMLElement>(name: string) => card.querySelector<T>(`[data-akad="${name}"]`);

  const selesai = akad.selesai ?? akad.mulai;
  field('tanggal')!.textContent = formatDate(akad.mulai);
  field('waktu')!.textContent = formatTime(akad.mulai);
  field('tempat')!.textContent = akad.tempat;
  field('alamat')!.textContent = akad.alamat ?? '';

  const maps = field<HTMLAnchorElement>('maps')!;
  const mapsUrl = safeUrl(akad.maps_url);
  if (mapsUrl) maps.href = mapsUrl;
  else maps.hidden = true;

  const location = [akad.tempat, akad.alamat].filter(Boolean).join(', ');
  const cal = {
    title: `Holy Matrimony ${couple}`,
    start: akad.mulai,
    end: selesai,
    location,
    details: `Holy Matrimony ${couple}.`,
  };
  field<HTMLAnchorElement>('gcal')!.href = googleCalendarUrl(cal);
  const icsEl = field<HTMLElement>('ics');
  if (icsEl) {
    icsEl.addEventListener('click', (e) => {
      e.preventDefault();
      const blob = new Blob([icsContent(cal, `matrimony@${location.length}.wedding`)], { type: 'text/calendar' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'holy-matrimony.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }

  card.classList.remove('hidden');
}

async function initGuest() {
  const guest = await getGuest();

  const greeting = document.querySelector<HTMLElement>('[data-guest-greeting]');
  if (greeting) {
    greeting.replaceChildren(document.createTextNode(greetingFor(guest)));
    greeting.dataset.state = 'ready';
  }

  if (guest?.akad) renderAkad(guest.akad);
  // Tamu khusus akad tidak perlu melihat kartu resepsi.
  if (guest?.sesi === 'akad') {
    document.querySelector('[data-resepsi-card]')?.classList.add('hidden');
  }
}

// ---------------------------------------------------------------- countdown

function initCountdown() {
  const box = document.querySelector<HTMLElement>('[data-countdown]');
  if (!box) return;
  const target = new Date(box.dataset.target!).getTime();
  const end = new Date(box.dataset.end!).getTime();
  const running = box.querySelector<HTMLElement>('[data-countdown-running]')!;
  const today = box.querySelector<HTMLElement>('[data-countdown-today]')!;
  const doneEl = box.querySelector<HTMLElement>('[data-countdown-done]')!;
  const units = Object.fromEntries(
    [...box.querySelectorAll<HTMLElement>('[data-unit]')].map((el) => [el.dataset.unit!, el]),
  );

  let timer: ReturnType<typeof setInterval>;
  const tick = () => {
    const now = Date.now();
    const phase = now < target ? 'running' : now < end ? 'today' : 'done';
    running.classList.toggle('hidden', phase !== 'running');
    today.classList.toggle('hidden', phase !== 'today');
    doneEl.classList.toggle('hidden', phase !== 'done');
    if (phase === 'done') return clearInterval(timer);
    if (phase !== 'running') return;

    let s = Math.floor((target - now) / 1000);
    const values = {
      days: Math.floor(s / 86400),
      hours: Math.floor((s %= 86400) / 3600),
      minutes: Math.floor((s %= 3600) / 60),
      seconds: s % 60,
    };
    for (const [k, v] of Object.entries(values)) {
      const el = units[k];
      const text = k === 'days' ? String(v) : String(v).padStart(2, '0');
      if (el && el.textContent !== text) el.textContent = text;
    }
  };
  tick();
  timer = setInterval(tick, 1000);
}

// ---------------------------------------------------------------- reveal

function initReveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((el) => io.observe(el));
}

// ---------------------------------------------------------------- copy

function initCopy() {
  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy ?? '';
    const ok = await copyText(text);
    toast(ok ? 'Copied to clipboard ✓' : `Could not copy automatically. Please copy manually:\n${text}`, ok ? 2000 : 6000);
  });
}

initCover();
initCountdown();
initReveal();
initCopy();
void initGuest();
