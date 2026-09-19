// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// PUBLIC_SITE_URL wajib https absolut: dipakai untuk OG tags & link personal tamu.
const rawSite = process.env.PUBLIC_SITE_URL || 'https://chanandlerz.github.io/WeddingCard';
const isGitHubPages = rawSite.includes('github.io') || rawSite.includes('github.com');
const site = isGitHubPages ? 'https://chanandlerz.github.io' : new URL(rawSite).origin;
const base = isGitHubPages ? '/WeddingCard/' : '/';

export default defineConfig({
  site,
  base,
  // base: '/WeddingCard',
  output: 'static',
  integrations: [preact()],
  build: {
    // Satu halaman utama: CSS di-inline menghilangkan request yang memblokir render.
    inlineStylesheets: 'always',
  },
  image: {
    // Hanya dipakai saat build (sharp). Tidak ada image service runtime di Cloudflare Pages.
    responsiveStyles: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
