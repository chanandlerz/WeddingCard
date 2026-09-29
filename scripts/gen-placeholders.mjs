// Membuat foto placeholder (gradien + label) supaya pipeline gambar bisa dites
// sebelum foto asli tersedia. Foto asli cukup ditimpa dengan nama file yang sama.
// Jalankan: npm run placeholders   (tidak menimpa file yang sudah ada; --force untuk menimpa)
import { mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const force = process.argv.includes('--force');

const palette = [
  ['#d9c7b0', '#8a7560'],
  ['#c9d3c0', '#5f6f58'],
  ['#e5d2cf', '#9a6f6a'],
  ['#d6d0c4', '#6d665b'],
];

const files = [
  { path: 'src/assets/cover.jpg', w: 1080, h: 1920, label: 'COVER', labelY: 20 },
  { path: 'src/assets/couple/groom.jpg', w: 800, h: 1000, label: 'MEMPELAI PRIA' },
  { path: 'src/assets/couple/bride.jpg', w: 800, h: 1000, label: 'MEMPELAI WANITA' },
  ...Array.from({ length: 8 }, (_, i) => {
    const portrait = i % 3 === 0;
    return {
      path: `src/assets/gallery/${String(i + 1).padStart(2, '0')}.jpg`,
      w: portrait ? 1080 : 1600,
      h: portrait ? 1440 : 1067,
      label: `GALERI ${i + 1}`,
    };
  }),
  { path: 'public/header.png', w: 1200, h: 630, label: 'RAKA & NADIA · 12.12.2026', quality: 75 },
];

const exists = (p) => access(p).then(() => true, () => false);

for (const [i, f] of files.entries()) {
  if (!force && (await exists(f.path))) {
    console.log('skip', f.path);
    continue;
  }
  const [a, b] = palette[i % palette.length];
  const size = Math.round(Math.min(f.w, f.h) / 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="4%" y="4%" width="92%" height="92%" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
    <text x="50%" y="${f.labelY ?? 50}%" font-family="Georgia, serif" font-size="${size}" fill="#fff"
      text-anchor="middle" dominant-baseline="middle" letter-spacing="4">${f.label.replaceAll('&', '&amp;')}</text>
  </svg>`;
  await mkdir(dirname(f.path), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: f.quality ?? 82, mozjpeg: true }).toFile(f.path);
  console.log('buat', f.path);
}
