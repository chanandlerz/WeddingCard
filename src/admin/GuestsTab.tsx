import { useEffect, useMemo, useState } from 'preact/hooks';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { STATUS_LABEL } from '../lib/labels';
import { parseCsv } from './csv';
import { normalizePhone, renderTemplate, shortWib, waUrl } from './format';
import { fetchAllGuests, fetchSettings, guestLink, sb, type GuestRow, type Sapaan, type Sesi } from './supabase';

const PAGE_SIZE = 50;

type Draft = {
  nama: string;
  sapaan: Sapaan;
  sesi: Sesi;
  max_pax: number;
  no_wa: string | null;
  grup: string | null;
};
type ParsedRow = { line: number; draft: Draft | null; error?: string; duplicate?: boolean };

const SESI_ALIASES: Record<string, Sesi> = {
  akad: 'akad',
  resepsi: 'resepsi',
  keduanya: 'keduanya',
  both: 'keduanya',
  'akad+resepsi': 'keduanya',
  'akad & resepsi': 'keduanya',
};

function toDraft(rec: Record<string, string>): Draft | string {
  const nama = (rec.nama ?? '').trim();
  if (!nama) return 'nama kosong';
  if (nama.length > 100) return 'nama > 100 karakter';
  const sapaanRaw = (rec.sapaan ?? '').trim().toLowerCase() || 'formal';
  if (sapaanRaw !== 'formal' && sapaanRaw !== 'informal') return `sapaan "${rec.sapaan}" tidak dikenal`;
  const sesiRaw = (rec.sesi ?? '').trim().toLowerCase() || 'resepsi';
  const sesi = SESI_ALIASES[sesiRaw];
  if (!sesi) return `sesi "${rec.sesi}" tidak dikenal`;
  const paxRaw = (rec.max_pax ?? '').trim();
  const max_pax = paxRaw === '' ? 2 : Number(paxRaw);
  if (!Number.isInteger(max_pax) || max_pax < 1 || max_pax > 20) return `max_pax "${paxRaw}" harus 1–20`;
  const waRaw = (rec.no_wa ?? '').trim();
  const no_wa = waRaw ? normalizePhone(waRaw) : null;
  if (waRaw && !no_wa) return `no_wa "${waRaw}" tidak valid`;
  return { nama, sapaan: sapaanRaw as Sapaan, sesi, max_pax, no_wa, grup: (rec.grup ?? '').trim() || null };
}

export default function GuestsTab() {
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [template, setTemplate] = useState('');
  const [error, setError] = useState('');
  const [grup, setGrup] = useState('');
  const [q, setQ] = useState('');
  const [sentFilter, setSentFilter] = useState<'all' | 'sent' | 'unsent'>('all');
  const [page, setPage] = useState(0);
  const [showImport, setShowImport] = useState(false);

  async function reload() {
    try {
      const [g, s] = await Promise.all([fetchAllGuests(), fetchSettings()]);
      setGuests(g);
      setTemplate(s.wa_template);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => void reload(), []);

  const groups = useMemo(
    () => [...new Set((guests ?? []).map((g) => g.grup).filter((x): x is string => Boolean(x)))].sort(),
    [guests],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (guests ?? []).filter(
      (g) =>
        (!grup || (grup === '__none' ? !g.grup : g.grup === grup)) &&
        (sentFilter === 'all' || (sentFilter === 'sent' ? g.sent_at : !g.sent_at)) &&
        (!needle || g.nama.toLowerCase().includes(needle) || g.slug.includes(needle)),
    );
  }, [guests, grup, q, sentFilter]);

  useEffect(() => setPage(0), [grup, q, sentFilter]);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function setSent(g: GuestRow, sent: boolean) {
    const sent_at = sent ? new Date().toISOString() : null;
    const { error: err } = await sb.from('guests').update({ sent_at }).eq('id', g.id);
    if (err) return toast(`Gagal: ${err.message}`);
    setGuests((cur) => cur?.map((x) => (x.id === g.id ? { ...x, sent_at } : x)) ?? null);
  }

  async function remove(g: GuestRow) {
    if (!confirm(`Hapus tamu "${g.nama}"? RSVP-nya ikut terhapus dan link-nya tidak berlaku lagi.`)) return;
    const { error: err } = await sb.from('guests').delete().eq('id', g.id);
    if (err) return toast(`Gagal: ${err.message}`);
    setGuests((cur) => cur?.filter((x) => x.id !== g.id) ?? null);
  }

  async function copyLink(g: GuestRow) {
    toast((await copyText(guestLink(g.slug))) ? 'Link disalin ✓' : 'Gagal menyalin');
  }

  async function copyMessage(g: GuestRow) {
    const ok = await copyText(renderTemplate(template, g, guestLink(g.slug)));
    toast(ok ? 'Pesan disalin ✓' : 'Gagal menyalin');
  }

  if (error) return <p class="text-rose-700">Gagal memuat: {error}</p>;
  if (!guests) return <p class="text-ink-soft">Memuat tamu…</p>;

  const sentCount = guests.filter((g) => g.sent_at).length;

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-ink-soft">
          {guests.length} tamu · {sentCount} sudah dikirim
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn btn-outline" onClick={() => void reload()}>
            Muat ulang
          </button>
          <button type="button" class="btn btn-primary" onClick={() => setShowImport((v) => !v)}>
            {showImport ? 'Tutup Import' : 'Import CSV'}
          </button>
        </div>
      </div>

      {showImport && (
        <ImportPanel
          existing={guests}
          onDone={() => {
            setShowImport(false);
            void reload();
          }}
        />
      )}

      <div class="flex flex-wrap gap-2">
        <input
          type="search"
          class="input !w-auto flex-1 !py-2"
          placeholder="Cari nama / slug…"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <select class="input !w-auto !py-2" value={grup} onChange={(e) => setGrup(e.currentTarget.value)}>
          <option value="">Semua grup</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="__none">(Tanpa grup)</option>
        </select>
        <select
          class="input !w-auto !py-2"
          value={sentFilter}
          onChange={(e) => setSentFilter(e.currentTarget.value as typeof sentFilter)}
        >
          <option value="all">Semua status kirim</option>
          <option value="unsent">Belum dikirim</option>
          <option value="sent">Sudah dikirim</option>
        </select>
      </div>

      <div class="overflow-x-auto rounded-xl bg-white ring-1 ring-ink/10">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="bg-paper-deep text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th class="px-3 py-2">Nama</th>
              <th class="px-3 py-2">Grup</th>
              <th class="px-3 py-2">Sesi</th>
              <th class="px-3 py-2">RSVP</th>
              <th class="px-3 py-2">Dibuka</th>
              <th class="px-3 py-2">Kirim</th>
              <th class="px-3 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((g) => {
              const phone = normalizePhone(g.no_wa);
              return (
                <tr key={g.id} class="border-t border-ink/5 align-top">
                  <td class="px-3 py-2">
                    <div class="font-medium">{g.nama}</div>
                    <div class="font-mono text-[11px] text-ink-soft">{g.slug}</div>
                    <div class="text-[11px] text-ink-soft">
                      {g.sapaan} · maks {g.max_pax} · {g.no_wa ?? 'tanpa no. WA'}
                    </div>
                  </td>
                  <td class="px-3 py-2">{g.grup ?? '–'}</td>
                  <td class="px-3 py-2">{g.sesi}</td>
                  <td class="px-3 py-2">
                    {g.rsvp ? `${STATUS_LABEL[g.rsvp.status]} (${g.rsvp.jumlah_orang})` : <span class="text-ink-soft">–</span>}
                  </td>
                  <td class="px-3 py-2 text-xs">{shortWib(g.opened_at)}</td>
                  <td class="px-3 py-2">
                    <label class="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={Boolean(g.sent_at)} onChange={(e) => void setSent(g, e.currentTarget.checked)} />
                      {g.sent_at ? shortWib(g.sent_at) : 'Belum'}
                    </label>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap justify-end gap-1">
                      <a
                        class="btn btn-primary !min-h-8 !px-3 !py-1 text-xs"
                        href={waUrl(phone, renderTemplate(template, g, guestLink(g.slug)))}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={phone ? `Kirim ke ${phone}` : 'Tanpa nomor: pilih kontak di WhatsApp'}
                      >
                        WA
                      </a>
                      <button type="button" class="btn btn-outline !min-h-8 !px-3 !py-1 text-xs" onClick={() => void copyLink(g)}>
                        Link
                      </button>
                      <button type="button" class="btn btn-outline !min-h-8 !px-3 !py-1 text-xs" onClick={() => void copyMessage(g)}>
                        Pesan
                      </button>
                      <a class="btn btn-outline !min-h-8 !px-3 !py-1 text-xs" href={guestLink(g.slug)} target="_blank" rel="noopener">
                        Buka
                      </a>
                      <button type="button" class="btn !min-h-8 !px-3 !py-1 text-xs text-rose-700" onClick={() => void remove(g)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} class="px-3 py-8 text-center text-ink-soft">
                  Tidak ada tamu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between text-sm">
        <span class="text-ink-soft">
          {filtered.length} hasil · halaman {page + 1}/{pageCount}
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

function ImportPanel({ existing, onDone }: { existing: GuestRow[]; onDone: () => void }) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [headerError, setHeaderError] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function onFile(file: File | undefined) {
    setRows(null);
    setHeaderError('');
    if (!file) return;
    const table = parseCsv(await file.text());
    if (table.length < 2) return setHeaderError('File kosong atau hanya berisi header.');

    const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    if (!header.includes('nama')) return setHeaderError('Kolom "nama" wajib ada di baris header.');

    const known = new Set(existing.map((g) => `${g.nama.toLowerCase()}|${(g.grup ?? '').toLowerCase()}`));
    const seen = new Set<string>();
    setRows(
      table.slice(1).map((cells, i) => {
        const rec = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
        const result = toDraft(rec);
        if (typeof result === 'string') return { line: i + 2, draft: null, error: result };
        const key = `${result.nama.toLowerCase()}|${(result.grup ?? '').toLowerCase()}`;
        const duplicate = known.has(key) || seen.has(key);
        seen.add(key);
        return { line: i + 2, draft: result, duplicate };
      }),
    );
  }

  const valid = rows?.filter((r) => r.draft && !(skipDuplicates && r.duplicate)) ?? [];
  const invalid = rows?.filter((r) => r.error) ?? [];
  const dupes = rows?.filter((r) => r.duplicate) ?? [];

  async function doImport() {
    setBusy(true);
    const drafts = valid.map((r) => r.draft!);
    const CHUNK = 200;
    for (let i = 0; i < drafts.length; i += CHUNK) {
      setProgress(`Mengimpor ${Math.min(i + CHUNK, drafts.length)}/${drafts.length}…`);
      // slug dibuat otomatis oleh trigger di database
      const { error } = await sb.from('guests').insert(drafts.slice(i, i + CHUNK));
      if (error) {
        setBusy(false);
        setProgress(`Gagal di baris ${i + 1}–${i + CHUNK}: ${error.message}. Baris sebelumnya sudah tersimpan.`);
        return;
      }
    }
    setBusy(false);
    toast(`${drafts.length} tamu diimpor ✓`);
    onDone();
  }

  return (
    <div class="card space-y-3">
      <h2 class="text-xl">Import Tamu dari CSV</h2>
      <p class="text-xs text-ink-soft">
        Kolom: <code>nama</code> (wajib), <code>sapaan</code> (formal/informal), <code>sesi</code>{' '}
        (akad/resepsi/keduanya), <code>max_pax</code> (1–20), <code>no_wa</code>, <code>grup</code>. Pemisah koma atau
        titik koma. Dari Google Sheets: File → Download → CSV. Contoh: <a class="underline" href={`${import.meta.env.BASE_URL}contoh-tamu.csv`}>contoh-tamu.csv</a>
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.currentTarget.files?.[0])} />
      {headerError && <p class="text-sm text-rose-700">{headerError}</p>}

      {rows && (
        <>
          <p class="text-sm">
            {rows.length} baris · <strong>{valid.length}</strong> akan diimpor · {invalid.length} error · {dupes.length}{' '}
            duplikat
          </p>
          {dupes.length > 0 && (
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.currentTarget.checked)} />
              Lewati nama yang sudah ada (nama + grup sama)
            </label>
          )}
          {invalid.length > 0 && (
            <ul class="max-h-40 overflow-y-auto rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
              {invalid.map((r) => (
                <li key={r.line}>
                  Baris {r.line}: {r.error}
                </li>
              ))}
            </ul>
          )}
          <div class="max-h-60 overflow-auto rounded-lg ring-1 ring-ink/10">
            <table class="w-full text-left text-xs">
              <thead class="bg-paper-deep">
                <tr>
                  {['#', 'Nama', 'Sapaan', 'Sesi', 'Pax', 'WA', 'Grup', ''].map((h) => (
                    <th key={h} class="px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.draft)
                  .slice(0, 100)
                  .map((r) => (
                    <tr key={r.line} class={`border-t border-ink/5 ${r.duplicate ? 'bg-amber-50' : ''}`}>
                      <td class="px-2 py-1">{r.line}</td>
                      <td class="px-2 py-1">{r.draft!.nama}</td>
                      <td class="px-2 py-1">{r.draft!.sapaan}</td>
                      <td class="px-2 py-1">{r.draft!.sesi}</td>
                      <td class="px-2 py-1">{r.draft!.max_pax}</td>
                      <td class="px-2 py-1">{r.draft!.no_wa ?? '–'}</td>
                      <td class="px-2 py-1">{r.draft!.grup ?? '–'}</td>
                      <td class="px-2 py-1">{r.duplicate ? 'duplikat' : ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-primary" disabled={busy || valid.length === 0} onClick={() => void doImport()}>
            {busy ? 'Mengimpor…' : `Impor ${valid.length} tamu`}
          </button>
          {progress && <p class="text-sm text-ink-soft">{progress}</p>}
        </>
      )}
    </div>
  );
}
