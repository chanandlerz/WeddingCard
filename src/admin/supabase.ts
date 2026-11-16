import { createClient } from '@supabase/supabase-js';

export const sb = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export type Sapaan = 'formal' | 'informal';
export type Sesi = 'akad' | 'resepsi' | 'keduanya';
export type Status = 'hadir' | 'tidak' | 'ragu';

export type GuestRow = {
  id: string;
  slug: string;
  nama: string;
  sapaan: Sapaan;
  sesi: Sesi;
  max_pax: number;
  no_wa: string | null;
  grup: string | null;
  sent_at: string | null;
  opened_at: string | null;
  created_at: string;
  rsvp: { status: Status; jumlah_orang: number; updated_at: string } | null;
};

export type WishRow = {
  id: number;
  nama: string;
  pesan: string;
  is_hidden: boolean;
  created_at: string;
  guest: { nama: string; slug: string } | null;
};

export type SettingsRow = {
  id: number;
  moderation_mode: boolean;
  wishes_frozen: boolean;
  rsvp_deadline: string | null;
  wa_template: string;
};

export type AkadData = {
  mulai?: string;
  selesai?: string;
  tempat?: string;
  alamat?: string;
  maps_url?: string;
};

const PAGE = 1000; // batas default max_rows PostgREST

/** Ambil semua tamu (+RSVP), per 1000 baris. */
export async function fetchAllGuests(): Promise<GuestRow[]> {
  const out: GuestRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('guests')
      .select('*, rsvp(status, jumlah_orang, updated_at)')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    // rsvp berelasi 1-1 (guest_id unique) → PostgREST mengembalikan objek atau null.
    out.push(...(data as unknown as GuestRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function fetchSettings(): Promise<SettingsRow> {
  const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data as SettingsRow;
}

/** Ambil semua ucapan untuk ekspor CSV, per 1000 baris. */
export async function fetchAllWishes(filter: 'all' | 'visible' | 'hidden' = 'all'): Promise<WishRow[]> {
  const out: WishRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb
      .from('wishes')
      .select('id, nama, pesan, is_hidden, created_at, guest:guests(nama, slug)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (filter !== 'all') query = query.eq('is_hidden', filter === 'hidden');
    const { data, error } = await query;
    if (error) throw error;
    out.push(...(data as unknown as WishRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function siteUrl(): string {
  return (import.meta.env.PUBLIC_SITE_URL || location.origin).replace(/\/+$/, '');
}

export const guestLink = (slug: string) => `${siteUrl()}/?to=${encodeURIComponent(slug)}`;
