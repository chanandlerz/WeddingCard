import type { APIRoute } from 'astro';
import { event } from '../config/event';
import { icsContent } from '../lib/calendar';

export const GET: APIRoute = ({ site }) => {
  const [first, second] = event.coupleOrder.map((k) => event[k].panggilan);
  const m = event.matrimony;
  const body = icsContent(
    {
      title: `${m.judul} ${first} & ${second}`,
      start: m.mulai,
      end: m.selesai,
      location: `${m.tempat}, ${m.alamat}`,
      details: `Pemberkatan pernikahan ${first} & ${second}. ${new URL('/', site).href}`,
    },
    `matrimony@${site?.host ?? 'wedding'}`,
  );
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
