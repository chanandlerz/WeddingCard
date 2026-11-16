import { useEffect, useState } from 'preact/hooks';
import { toast } from '../lib/toast';
import { downloadCsv, toCsv } from './csv';
import { shortWib } from './format';
import { fetchAllWishes, fetchSettings, sb, type SettingsRow, type WishRow } from './supabase';

const PAGE_SIZE = 30;
type Filter = 'all' | 'visible' | 'hidden';

const WISH_CSV_HEADER = ['id', 'nama', 'pesan', 'status_tampil', 'tamu_terkait', 'slug_tamu', 'waktu (WIB)'];
const wishToRow = (w: WishRow) => [
  w.id,
  w.nama,
  w.pesan,
  w.is_hidden ? 'Tersembunyi' : 'Tampil',
  w.guest ? w.guest.nama : '',
  w.guest ? w.guest.slug : '',
  shortWib(w.created_at),
];
const stamp = () => new Date().toISOString().slice(0, 10);

export default function WishesTab() {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [rows, setRows] = useState<WishRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  async function load() {
    setLoading(true);
    let query = sb
      .from('wishes')
      .select('id, nama, pesan, is_hidden, created_at, guest:guests(nama, slug)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filter !== 'all') query = query.eq('is_hidden', filter === 'hidden');
    const { data, error: err, count } = await query;
    setLoading(false);
    if (err) return setError(err.message);
    setRows(data as unknown as WishRow[]);
    setTotal(count ?? 0);
  }
  useEffect(() => void load(), [filter, page]);

  async function toggleSetting(key: 'moderation_mode' | 'wishes_frozen', value: boolean) {
    const label = key === 'moderation_mode' ? 'Mode moderasi' : 'Tutup form ucapan';
    if (key === 'wishes_frozen' && value && !confirm('Tutup form ucapan untuk semua tamu sekarang?')) return;
    const { error: err } = await sb.from('settings').update({ [key]: value }).eq('id', 1);
    if (err) return toast(`Gagal: ${err.message}`);
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    toast(`${label}: ${value ? 'AKTIF' : 'nonaktif'}`);
  }

  async function setHidden(w: WishRow, is_hidden: boolean) {
    const { error: err } = await sb.from('wishes').update({ is_hidden }).eq('id', w.id);
    if (err) return toast(`Gagal: ${err.message}`);
    setRows((cur) => cur.map((x) => (x.id === w.id ? { ...x, is_hidden } : x)));
  }

  async function remove(w: WishRow) {
    if (!confirm(`Hapus permanen ucapan dari "${w.nama}"?`)) return;
    const { error: err } = await sb.from('wishes').delete().eq('id', w.id);
    if (err) return toast(`Gagal: ${err.message}`);
    setRows((cur) => cur.filter((x) => x.id !== w.id));
    setTotal((t) => t - 1);
  }

  async function exportCsv() {
    try {
      setExporting(true);
      const allWishes = await fetchAllWishes(filter);
      const suffix = filter === 'all' ? 'semua' : filter;
      downloadCsv(`ucapan-${suffix}-${stamp()}.csv`, toCsv(WISH_CSV_HEADER, allWishes.map(wishToRow)));
      toast(`Berhasil mengekspor ${allWishes.length} ucapan`);
    } catch (e) {
      toast(`Gagal mengekspor: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  if (error) return <p class="text-rose-700">Gagal memuat: {error}</p>;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div class="space-y-4">
      {settings && (
        <div class="grid gap-3 sm:grid-cols-2">
          <Toggle
            title="Mode moderasi"
            desc="Ucapan baru disembunyikan sampai Anda tampilkan manual. Aktifkan saat mulai ada spam."
            checked={settings.moderation_mode}
            onChange={(v) => void toggleSetting('moderation_mode', v)}
          />
          <Toggle
            title="Tutup form ucapan (darurat)"
            desc="Tamu tidak bisa mengirim ucapan baru. RSVP tetap bisa."
            checked={settings.wishes_frozen}
            danger
            onChange={(v) => void toggleSetting('wishes_frozen', v)}
          />
        </div>
      )}

      <div class="flex flex-wrap items-center gap-2">
        {(['all', 'visible', 'hidden'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            class={`rounded-full px-3 py-1.5 text-xs ${filter === f ? 'bg-ink text-paper' : 'bg-white ring-1 ring-ink/10'}`}
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
          >
            {{ all: 'Semua', visible: 'Tampil', hidden: 'Tersembunyi' }[f]}
          </button>
        ))}
        <span class="ml-auto text-xs text-ink-soft">{total} ucapan</span>
        <button type="button" class="btn btn-outline !min-h-8 text-xs" onClick={() => void load()}>
          Muat ulang
        </button>
        <button
          type="button"
          class="btn btn-outline !min-h-8 text-xs"
          disabled={exporting || total === 0}
          onClick={() => void exportCsv()}
        >
          {exporting ? 'Mengekspor…' : 'Ekspor CSV'}
        </button>
      </div>

      <ul class="space-y-2">
        {rows.map((w) => (
          <li key={w.id} class={`rounded-xl bg-white p-3 ring-1 ${w.is_hidden ? 'ring-rose-200 opacity-70' : 'ring-ink/10'}`}>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <strong>{w.nama}</strong>
              {w.guest ? (
                <span class="rounded-full bg-gold/15 px-2 text-[11px] text-gold" title={w.guest.slug}>
                  tamu: {w.guest.nama}
                </span>
              ) : (
                <span class="rounded-full bg-ink/5 px-2 text-[11px] text-ink-soft">tanpa link</span>
              )}
              {w.is_hidden && <span class="rounded-full bg-rose-100 px-2 text-[11px] text-rose-800">tersembunyi</span>}
              <span class="ml-auto text-xs text-ink-soft">{shortWib(w.created_at)}</span>
            </div>
            <p class="mt-1 whitespace-pre-line break-words text-sm">{w.pesan}</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="btn btn-outline !min-h-8 !py-1 text-xs"
                onClick={() => void setHidden(w, !w.is_hidden)}
              >
                {w.is_hidden ? 'Tampilkan' : 'Sembunyikan'}
              </button>
              <button type="button" class="btn !min-h-8 !py-1 text-xs text-rose-700" onClick={() => void remove(w)}>
                Hapus permanen
              </button>
            </div>
          </li>
        ))}
        {!loading && rows.length === 0 && <li class="py-8 text-center text-sm text-ink-soft">Tidak ada ucapan.</li>}
        {loading && <li class="py-8 text-center text-sm text-ink-soft">Memuat…</li>}
      </ul>

      <div class="flex items-center justify-between text-sm">
        <span class="text-ink-soft">
          Halaman {page + 1}/{pageCount}
        </span>
        <div class="flex gap-2">
          <button type="button" class="btn btn-outline !min-h-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹ Sebelumnya
          </button>
          <button
            type="button"
            class="btn btn-outline !min-h-8"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya ›
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle(props: { title: string; desc: string; checked: boolean; danger?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      class={`flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 ${
        props.checked ? (props.danger ? 'bg-rose-50 ring-rose-300' : 'bg-amber-50 ring-amber-300') : 'bg-white ring-ink/10'
      }`}
    >
      <input
        type="checkbox"
        class="mt-1 h-5 w-5"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>
        <span class="block text-sm font-semibold">
          {props.title} {props.checked ? '— AKTIF' : ''}
        </span>
        <span class="block text-xs text-ink-soft">{props.desc}</span>
      </span>
    </label>
  );
}
