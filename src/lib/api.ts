// Client publik yang ringan: RPC lewat fetch biasa (tanpa supabase-js) supaya
// JS awal kecil. supabase-js hanya dimuat lazy untuk realtime (lihat realtime.ts).

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const backendConfigured = Boolean(SUPABASE_URL && ANON_KEY);

export type RsvpStatus = 'hadir' | 'tidak' | 'ragu';

export type AkadInfo = {
  mulai: string;
  selesai?: string;
  tempat: string;
  alamat?: string;
  maps_url?: string;
};

export type Guest = {
  slug: string;
  nama: string;
  sapaan: 'formal' | 'informal';
  sesi: 'akad' | 'resepsi' | 'keduanya';
  max_pax: number;
  akad: AkadInfo | null;
  rsvp: { status: RsvpStatus; jumlah_orang: number } | null;
};

export type PublicSettings = {
  wishes_frozen: boolean;
  rsvp_deadline: string | null;
};

export type Wish = {
  id: number;
  nama: string;
  pesan: string;
  created_at: string;
  is_guest: boolean;
  rsvp_status: RsvpStatus | null;
};

export type SubmitPayload = {
  token: string;
  slug: string | null;
  nama: string;
  pesan: string;
  status: RsvpStatus | null;
  jumlah: number | null;
};

export type SubmitResult =
  | { ok: true; wish: Wish | null; rsvp: Guest['rsvp']; hidden: boolean }
  | { ok: false; error: string };

async function rpc<T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (!backendConfigured) throw new Error('backend_not_configured');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) throw new Error(`rpc_${fn}_${res.status}`);
  return res.json() as Promise<T>;
}

/** Slug dari ?to=… (dibersihkan). null jika kosong / format tidak valid. */
export function readSlug(): string | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('to');
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 64 ? slug : null;
}

let guestPromise: Promise<Guest | null> | undefined;

/** Data tamu (dimemo; dipanggil sekali per halaman). Gagal/tidak ketemu → null (fallback). */
export function getGuest(): Promise<Guest | null> {
  guestPromise ??= (async () => {
    const slug = readSlug();
    if (!slug || !backendConfigured) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const data = await rpc<Omit<Guest, 'slug'> | null>('get_guest', { p_slug: slug }, ctrl.signal);
      clearTimeout(timer);
      return data ? { ...data, slug } : null;
    } catch (err) {
      console.warn('get_guest gagal, pakai fallback', err);
      return null;
    }
  })();
  return guestPromise;
}

/** Update cache tamu lokal setelah RSVP tersimpan. */
export function patchGuestRsvp(rsvp: Guest['rsvp']) {
  guestPromise = guestPromise?.then((g) => (g ? { ...g, rsvp } : g));
}

let settingsPromise: Promise<PublicSettings> | undefined;

export function getPublicSettings(): Promise<PublicSettings> {
  settingsPromise ??= rpc<PublicSettings>('get_public_settings', {}).catch((err) => {
    console.warn('get_public_settings gagal', err);
    return { wishes_frozen: false, rsvp_deadline: null };
  });
  return settingsPromise;
}

export const PAGE_SIZE = 15;

export function listWishes(before?: Pick<Wish, 'created_at' | 'id'>): Promise<Wish[]> {
  return rpc<Wish[]>('list_wishes', {
    p_before_created: before?.created_at ?? null,
    p_before_id: before?.id ?? null,
    p_limit: PAGE_SIZE,
  });
}

export async function submitEntry(payload: SubmitPayload): Promise<SubmitResult> {
  if (!backendConfigured) return { ok: false, error: 'backend_not_configured' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-wish`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY!,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (data && typeof data.ok === 'boolean') return data as SubmitResult;
    return { ok: false, error: res.status === 429 ? 'rate_limited' : 'server_error' };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  captcha_failed: 'Security verification failed. Please try again.',
  rate_limited: 'Too many submissions. Please wait a few moments and try again.',
  invalid_name: 'Name is required (maximum 60 characters).',
  message_too_long: 'Message cannot exceed 500 characters.',
  invalid_status: 'Please select your attendance status.',
  invalid_pax: 'Number of guests exceeds your invitation quota.',
  profanity: 'Message contains inappropriate language. Please revise.',
  empty: 'Please write a message before sending.',
  rsvp_closed: 'We are sorry, the RSVP deadline has passed.',
  wishes_frozen: 'Wishes submission is currently closed.',
  forbidden_origin: 'Request was rejected.',
  network_error: 'Connection error. Please check your internet and try again.',
  backend_not_configured: 'Service is not yet configured.',
  server_error: 'An unexpected error occurred. Please try again.',
};
