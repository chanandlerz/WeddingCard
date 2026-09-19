// =====================================================================
// DATA ACARA PUBLIK — semua nilai di bawah masih PLACEHOLDER.
// Ganti sesuai checklist konten (docs/CONTENT_CHECKLIST.md).
//
// ⚠️ Jangan taruh data privat di sini (file ini ikut ke bundle publik):
//    - detail akad → tabel event_private (diisi lewat /admin → Pengaturan)
//    - daftar tamu  → tabel guests (import CSV di /admin)
//    - deadline RSVP → tabel settings (supaya ditegakkan server)
//
// Semua waktu WAJIB ISO 8601 dengan offset WIB eksplisit: +07:00
// =====================================================================

export type Person = {
  panggilan: string;
  namaLengkap: string;
  anakKe: string;
  ayah: string;
  ibu: string;
  instagram?: string;
};

export type BankAccount = { bank: string; nomor: string; atasNama: string };

const basePath = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');

export const event = {
  site: {
    title: 'The Wedding of Dedy & Evita',
    description: 'Together with their families, Dedy & Evita joyfully invite you to celebrate their holy matrimony.',
    // OG Image: 1200×630, < 300KB in /public
    ogImage: '/og.jpg',
    themeColor: '#FAF8F5',
  },

  groom: {
    panggilan: 'Dedy',
    namaLengkap: 'Dedy Erianjono Lubis',
    anakKe: 'Son of',
    ayah: 'Mr. Lubis',
    ibu: 'Mrs. Lubis',
    instagram: 'dedylbs',
  } satisfies Person,

  bride: {
    panggilan: 'Evita',
    namaLengkap: 'Evita Hutagalung',
    anakKe: 'Daughter of',
    ayah: 'Mr. Hutagalung',
    ibu: 'Mrs. Hutagalung',
    instagram: 'evitahutagalung',
  } satisfies Person,

  // Name order on cover/hero
  coupleOrder: ['groom', 'bride'] as const,

  // Holy Matrimony & Reception details
  resepsi: {
    judul: 'Wedding Reception',
    mulai: '2026-10-27T11:00:00+07:00',
    selesai: '2026-10-27T14:00:00+07:00',
    tempat: 'Grand Ballroom (Venue Name)',
    alamat: 'Jl. Sudirman No. 123, Jakarta Selatan',
    mapsUrl: 'https://maps.google.com/?q=-6.2,106.8',
  },

  // Show thank you message after this time
  selesaiSemua: '2026-10-27T14:00:00+07:00',

  quote: {
    teks:
      'And over all these virtues put on love, which binds them all together in perfect unity.',
    sumber: 'Colossians 3:14',
  },

  // Love story — leave empty to hide section
  story: [
    {
      tahun: '2019',
      judul: 'First Encounter',
      teks: 'Two paths crossed in God’s perfect timing, sparking a friendship anchored in faith and shared laughter.',
    },
    {
      tahun: '2022',
      judul: 'Growing in Love',
      teks: 'Walking through seasons together, learning, growing, and discovering God’s grace in one another.',
    },
    {
      tahun: '2026',
      judul: 'The Promise',
      teks: 'With joyous hearts and humble prayers, we decided to embark on a lifelong journey as one in Christ.',
    },
  ],

  gift: {
    intro:
      'Your presence and warm prayers are the greatest blessing to our marriage. However, should you wish to honor us with a wedding gift, you may send it through:',
    accounts: [
      { bank: 'BCA', nomor: 'xxx', atasNama: 'Evita Hutagalung' },
      { bank: 'Mandiri', nomor: 'xxx', atasNama: 'Evita Hutagalung' },
    ] satisfies BankAccount[],
    alamat: {
      penerima: 'Evita Hutagalung',
      teks: 'Jl. Sudirman No. 45, Kebayoran Baru, Jakarta Selatan 12110',
    },
  },

  music: {
    src: `${basePath}/music/backsound.mp3`,
    judul: 'Wedding Song',
  },

  // Guest greeting prefix: "Dear, {label} {name}"
  sapaanLabel: {
    formal: 'Mr. & Mrs.',
    informal: '',
  },
  fallbackGuestName: 'Honored Guest',

  footer: {
    penutup:
      'It is our greatest joy and honor to have you celebrate and pray with us as we enter this holy covenant.',
    salam: 'With love & gratitude,',
  },
} as const;

export type EventConfig = typeof event;
