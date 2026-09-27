import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { PAGE_SIZE, backendConfigured, listWishes } from '../lib/api';
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../lib/labels';
import { subscribeWishes } from '../lib/realtime';
import { formatRelative } from '../lib/time';
import { on, type LocalWish } from '../lib/wishBus';

const POLL_MS = 30_000;
const UNSUBSCRIBE_DELAY_MS = 5_000;

const byNewest = (a: LocalWish, b: LocalWish) => {
  if (a.pending !== b.pending) return a.pending ? -1 : 1;
  const t = b.created_at.localeCompare(a.created_at);
  return t !== 0 ? t : b.id - a.id;
};

function merge(current: LocalWish[], incoming: LocalWish[]): LocalWish[] {
  const map = new Map(current.map((w) => [w.id, w]));
  for (const w of incoming) map.set(w.id, { ...map.get(w.id), ...w });
  return [...map.values()].sort(byNewest);
}

export default function WishList() {
  const [items, setItems] = useState<LocalWish[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [live, setLive] = useState<'off' | 'realtime' | 'polling'>('off');
  const [, setNow] = useState(Date.now());

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  /** Halaman berikutnya (cursor = ucapan tertua yang sudah dimuat). */
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const oldest = [...itemsRef.current].reverse().find((w) => w.id > 0);
      const page = await listWishes(oldest);
      setItems((cur) => merge(cur, page));
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      console.warn('gagal memuat ucapan', err);
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  /** Ambil halaman teratas lagi & gabungkan (dipakai polling / kembali terlihat). */
  const refreshTop = useCallback(async () => {
    try {
      const page = await listWishes();
      setItems((cur) => merge(cur, page));
    } catch {
      // diam: coba lagi di putaran berikutnya
    }
  }, []);

  // Optimistic update dari form
  useEffect(() => {
    const offs = [
      on('wish:optimistic', ({ wish }) => setItems((cur) => merge(cur, [wish]))),
      on('wish:failed', ({ tempId }) => setItems((cur) => cur.filter((w) => w.id !== tempId))),
      on('wish:confirmed', ({ tempId, wish, hidden }) =>
        setItems((cur) => {
          const rest = cur.filter((w) => w.id !== tempId);
          if (!wish) return rest;
          // Ucapan yang masuk moderasi hanya tampil di perangkat pengirim.
          return merge(rest, [{ ...wish, awaitingModeration: hidden }]);
        }),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Realtime hanya saat section terlihat; fallback polling 30 detik.
  useEffect(() => {
    if (!backendConfigured || !rootRef.current) return;

    let unsubscribe: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    let everVisible = false;
    let connecting = false;

    const startPolling = () => {
      if (pollTimer || !visible) return;
      setLive('polling');
      pollTimer = setInterval(refreshTop, POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const connect = async () => {
      if (unsubscribe || connecting) return;
      connecting = true;
      const unsub = await subscribeWishes({
        onNew: (w) => setItems((cur) => merge(cur, [w])),
        onHidden: (id) => setItems((cur) => cur.filter((w) => w.id !== id || w.awaitingModeration)),
        onStatus: (ok) => {
          if (!visible) return; // CLOSED karena kita sendiri yang unsubscribe
          if (ok) {
            stopPolling();
            setLive('realtime');
          } else {
            startPolling();
          }
        },
      });
      connecting = false;
      if (!visible) unsub();
      else unsubscribe = unsub;
    };

    const disconnect = () => {
      unsubscribe?.();
      unsubscribe = null;
      stopPolling();
      setLive('off');
    };

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        clearTimeout(leaveTimer);
        if (visible) return;
        visible = true;
        if (!everVisible) {
          everVisible = true;
          void loadMore();
        } else {
          void refreshTop(); // tangkap ucapan yang terlewat saat tidak terlihat
        }
        void connect();
      } else if (visible) {
        leaveTimer = setTimeout(() => {
          visible = false;
          disconnect();
        }, UNSUBSCRIBE_DELAY_MS);
      }
    });
    io.observe(rootRef.current);

    return () => {
      io.disconnect();
      clearTimeout(leaveTimer);
      visible = false;
      disconnect();
    };
  }, [loadMore, refreshTop]);

  // Infinite scroll di dalam container
  useEffect(() => {
    if (!sentinelRef.current || !scrollRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && itemsRef.current.length > 0) void loadMore();
      },
      { root: scrollRef.current, rootMargin: '200px' },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  // Perbarui "x menit yang lalu"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!backendConfigured) return null;

  return (
    <div ref={rootRef} class="mt-8 rounded-2xl bg-paper/80 p-4 sm:p-5 shadow-[0_8px_30px_-12px_rgb(58_51_43/0.2)] ring-1 ring-gold-soft/60 backdrop-blur-xs">
      <div class="mb-3 flex items-center justify-between border-b border-ink/5 pb-2 text-xs text-ink-soft">
        <span class="font-serif text-sm font-semibold tracking-wide text-ink">
          {items.filter((w) => !w.awaitingModeration).length > 0 ? 'Recent Wishes' : 'Wishes'}
        </span>
        {live !== 'off' && (
          <span class="flex items-center gap-1.5 font-sans text-[11px]">
            <span class={`h-2 w-2 rounded-full ${live === 'realtime' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {live === 'realtime' ? 'Live' : 'Updated periodically'}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        class="wishes-scrollbar max-h-[420px] space-y-3 overflow-y-auto overscroll-contain pr-1.5"
        aria-live="polite"
        aria-busy={loading}
      >
        {items.map((w) => (
          <Bubble key={w.id} wish={w} />
        ))}

        {!loading && !error && items.length === 0 && (
          <p class="py-10 text-center text-sm text-ink-soft">No wishes yet. Be the first to share a blessing!</p>
        )}
        {loading && (
          <div class="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} class="h-20 w-4/5 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        )}
        {error && (
          <div class="py-4 text-center">
            <p class="text-sm text-ink-soft">Failed to load wishes.</p>
            <button type="button" class="btn btn-outline mt-2 !min-h-9 text-xs" onClick={() => void loadMore()}>
              Try again
            </button>
          </div>
        )}
        {hasMore && !loading && !error && items.length > 0 && (
          <button type="button" class="btn btn-outline w-full !min-h-9 text-xs" onClick={() => void loadMore()}>
            Load more wishes
          </button>
        )}
        <div ref={sentinelRef} class={hasMore ? 'h-px' : 'hidden'} />
      </div>
    </div>
  );
}

function Bubble({ wish }: { wish: LocalWish }) {
  const initial = wish.nama.trim().charAt(0).toUpperCase() || '?';
  return (
    <article class={`flex gap-2.5 ${wish.pending ? 'opacity-60' : ''}`}>
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20 font-serif text-lg font-semibold text-gold"
        aria-hidden="true"
      >
        {initial}
      </div>
      <div class="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
        <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 class="break-words font-sans text-sm font-semibold text-ink">{wish.nama}</h3>
          {wish.is_guest && (
            <span class="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold">Invited Guest</span>
          )}
          {wish.rsvp_status && (
            <span class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[wish.rsvp_status]}`}>
              {STATUS_LABEL[wish.rsvp_status]}
            </span>
          )}
        </header>
        {/* Plain text: Preact meng-escape isi; whitespace-pre-line menjaga baris baru. */}
        <p class="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{wish.pesan}</p>
        <footer class="mt-1.5 text-[11px] text-ink-soft">
          {wish.pending ? (
            'Sending…'
          ) : wish.awaitingModeration ? (
            'Awaiting moderation · visible only to you'
          ) : (
            <time dateTime={wish.created_at}>{formatRelative(wish.created_at)}</time>
          )}
        </footer>
      </div>
    </article>
  );
}
