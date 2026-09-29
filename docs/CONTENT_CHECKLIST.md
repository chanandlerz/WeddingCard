# Checklist Konten dari Klien

Kirim semua bahan **paling lambat minggu ke-2 pengerjaan**. Konten yang terlambat adalah penyebab paling umum mundurnya jadwal.

## 1. Data mempelai → `src/config/event.ts`
- [ ] Nama panggilan pria & wanita, serta urutan tampil (wanita dulu atau pria dulu)
- [ ] Nama lengkap + gelar
- [ ] Keterangan anak ke- ("Putra pertama dari …")
- [ ] Nama ayah & ibu (lengkap dengan gelar/almarhum bila ada)
- [ ] Username Instagram (opsional)

## 2. Acara
Semua waktu ditulis dalam **WIB (+07:00)**.

| Item | Resepsi (publik) | Akad (privat) |
|---|---|---|
| Tanggal | ☐ | ☐ |
| Jam mulai – selesai | ☐ | ☐ |
| Nama tempat | ☐ | ☐ |
| Alamat lengkap | ☐ | ☐ |
| Link Google Maps (Share → Copy link) | ☐ | ☐ |

- Resepsi diisi di `src/config/event.ts`.
- Akad diisi lewat **/admin → Pengaturan → Detail Akad**. Jangan ditulis di kode.
- [ ] Batas waktu RSVP (tanggal & jam WIB), diisi di /admin → Pengaturan.
- [ ] Waktu "acara selesai" untuk memunculkan pesan terima kasih (`selesaiSemua`).

## 3. Foto
Kirim file asli (tanpa kompres WA; kirim via Google Drive). Kompresi dilakukan otomatis saat build.

| File | Rasio / ukuran minimal | Lokasi |
|---|---|---|
| Foto cover | Portrait 9:16, min. 1080×1920 | `src/assets/cover.jpg` |
| Foto mempelai pria | Portrait 4:5, min. 800×1000 | `src/assets/couple/groom.jpg` |
| Foto mempelai wanita | Portrait 4:5, min. 800×1000 | `src/assets/couple/bride.jpg` |
| Galeri prewedding | 6–12 foto, sisi panjang ≥ 1600px | `src/assets/gallery/01.jpg`, `02.jpg`, … |
| Thumbnail WhatsApp (OG) | **1200×630, < 300KB**, JPG | `public/header.png` |

- [ ] Wajah di foto cover berada di **sepertiga atas**, karena bagian bawah tertutup teks.
- [ ] Thumbnail OG final **sebelum blast**. WhatsApp menyimpan cache preview dan sulit diperbarui.

## 4. Teks
- [ ] Ayat / quote pembuka + sumbernya
- [ ] Love story (tahun, judul, 1–3 kalimat per momen), atau konfirmasi section ini dihapus
- [ ] Kalimat penutup & salam
- [ ] Template pesan WhatsApp untuk blast (/admin → Pengaturan)
- [ ] Label sapaan: formal = "Bapak/Ibu", informal = kosong? (`sapaanLabel`)

## 5. Amplop digital & kado
- [ ] Nama bank, nomor rekening, atas nama (bisa lebih dari satu)
- [ ] **Cek ulang nomor rekening dengan pemilik rekening** (salah 1 digit = uang nyasar)
- [ ] Nama penerima & alamat lengkap untuk kirim kado

## 6. Musik
- [ ] Judul lagu + file audio
- [ ] Format MP3, 96–128 kbps, **1–2 MB** (±1,5–2 menit, akan di-loop)
- [ ] Pastikan boleh dipakai (hak cipta)
- Lokasi: `public/music/backsound.mp3`

## 7. Daftar tamu (CSV)
Template: [`public/contoh-tamu.csv`](../public/contoh-tamu.csv). Dari Google Sheets: *File → Download → CSV*.

| Kolom | Wajib | Isi |
|---|---|---|
| `nama` | ✅ | Nama seperti ingin ditampilkan. Boleh diawali gelar ("Bapak Hartono"); sapaan otomatis tidak akan dobel |
| `sapaan` | – | `formal` (default) / `informal` |
| `sesi` | – | `resepsi` (default) / `akad` / `keduanya` |
| `max_pax` | – | Kuota orang per undangan, 1–20 (default 2) |
| `no_wa` | – | 08xx / +62xx, untuk tombol kirim WA |
| `grup` | – | Mis. "Keluarga Pria", "Teman Kantor", untuk filter & rekap |

- [ ] Nama sudah dicek ejaan & gelarnya
- [ ] Nama yang sama persis dibedakan (mis. "Budi Santoso (Kantor)")
- [ ] `sesi` akad hanya untuk tamu yang memang diundang akad

## 8. Akun & akses
- [ ] Email untuk akun admin (1–3 orang)
- [ ] Domain yang diinginkan (atau subdomain)
