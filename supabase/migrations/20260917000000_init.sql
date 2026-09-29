-- =====================================================================
-- Undangan Pernikahan Digital — schema, RLS, RPC, index
-- Semua timestamp disimpan sebagai timestamptz; tampilan selalu WIB (+07:00).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------

create table public.guests (
  id          uuid primary key default gen_random_uuid(),
  -- diisi otomatis oleh trigger guests_set_slug: nama-tamu-xxxxxx
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
  nama        text not null check (length(btrim(nama)) between 1 and 100),
  sapaan      text not null default 'formal' check (sapaan in ('formal', 'informal')),
  sesi        text not null default 'resepsi' check (sesi in ('akad', 'resepsi', 'keduanya')),
  max_pax     int  not null default 2 check (max_pax between 1 and 20),
  no_wa       text,
  grup        text,
  sent_at     timestamptz,
  opened_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index guests_grup_idx on public.guests (grup);

create table public.rsvp (
  id            bigint generated always as identity primary key,
  guest_id      uuid not null unique references public.guests (id) on delete cascade,
  status        text not null check (status in ('hadir', 'tidak', 'ragu')),
  jumlah_orang  int  not null default 0 check (jumlah_orang between 0 and 20),
  updated_at    timestamptz not null default now()
);

create table public.wishes (
  id          bigint generated always as identity primary key,
  guest_id    uuid references public.guests (id) on delete set null,
  nama        text not null check (length(btrim(nama)) between 1 and 60),
  pesan       text not null check (length(btrim(pesan)) between 1 and 500),
  is_hidden   boolean not null default false,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index wishes_feed_idx on public.wishes (is_hidden, created_at desc, id desc);
create index wishes_guest_idx on public.wishes (guest_id);

create table public.rate_limits (
  key           text primary key,          -- ip_hash
  window_start  timestamptz not null default now(),
  count         int not null default 0
);

-- Satu baris saja (id = 1).
create table public.settings (
  id               int primary key default 1 check (id = 1),
  moderation_mode  boolean not null default false,
  wishes_frozen    boolean not null default false,
  rsvp_deadline    timestamptz,
  -- Placeholder: {sapaan}, {nama}, {link}
  wa_template      text not null default
    E'Kepada Yth.\n{sapaan} {nama}\n\nDengan segala kerendahan hati dan penuh cinta kasih dari Tuhan, melalui pesan ini kami ingin berbagi kebahagiaan dan mengundang Bapak/Ibu/Saudara/I untuk hadir dalam merayakan hari berbahagia kami.\n\nInfo lengkap acara:\n{link}\n\nMerupakan suatu kehormatan bagi kami apabila berkenan hadir dan memberikan doa restu.\n\nSalam hangat,\nDedy & Evita',
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- Data acara yang TIDAK boleh ada di bundle frontend (akad privat).
-- akad: {"mulai","selesai","tempat","alamat","maps_url"} — mulai/selesai ISO 8601 +07:00
create table public.event_private (
  id          int primary key default 1 check (id = 1),
  akad        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.event_private (id) values (1);

create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helper & trigger
-- ---------------------------------------------------------------------

create or replace function public.slugify(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(left(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-'), 40), '-'), ''),
    'tamu'
  );
$$;

create or replace function public.guests_set_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base      text;
  candidate text;
  attempts  int := 0;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := lower(btrim(new.slug));
    return new;
  end if;

  base := public.slugify(new.nama);
  loop
    candidate := base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    exit when not exists (select 1 from public.guests g where g.slug = candidate);
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Gagal membuat slug unik untuk %', new.nama;
    end if;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger guests_set_slug
  before insert on public.guests
  for each row execute function public.guests_set_slug();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rsvp_touch before update on public.rsvp
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger event_private_touch before update on public.event_private
  for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- Bentuk publik satu ucapan (tanpa guest_id / ip_hash).
create or replace function public.wish_public_json(w public.wishes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',          w.id,
    'nama',        w.nama,
    'pesan',       w.pesan,
    'created_at',  w.created_at,
    'is_guest',    w.guest_id is not null,
    'rsvp_status', (select r.status from public.rsvp r where r.guest_id = w.guest_id)
  );
$$;

-- Realtime: broadcast payload yang sudah disanitasi ke topic publik "wishes",
-- sehingga tabel wishes tidak perlu bisa di-SELECT oleh anon.
create or replace function public.wishes_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if not new.is_hidden then
        perform realtime.send(public.wish_public_json(new), 'wish_new', 'wishes', false);
      end if;
    elsif tg_op = 'UPDATE' then
      if new.is_hidden and not old.is_hidden then
        perform realtime.send(jsonb_build_object('id', new.id), 'wish_hidden', 'wishes', false);
      elsif not new.is_hidden and old.is_hidden then
        perform realtime.send(public.wish_public_json(new), 'wish_new', 'wishes', false);
      end if;
    elsif tg_op = 'DELETE' then
      perform realtime.send(jsonb_build_object('id', old.id), 'wish_hidden', 'wishes', false);
    end if;
  exception when others then
    -- Realtime gagal tidak boleh menggagalkan tulis; klien punya fallback polling.
    raise warning 'wishes_broadcast gagal: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger wishes_broadcast
  after insert or update of is_hidden or delete on public.wishes
  for each row execute function public.wishes_broadcast();

-- ---------------------------------------------------------------------
-- RPC publik (anon)
-- ---------------------------------------------------------------------

-- Satu tamu berdasarkan slug. Mengisi opened_at saat pertama dibuka.
-- Data akad hanya dikembalikan untuk sesi akad/keduanya.
create or replace function public.get_guest(p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g       public.guests;
  r       public.rsvp;
  v_akad  jsonb;
  v_rsvp  jsonb;
begin
  if p_slug is null or length(p_slug) > 64 then
    return null;
  end if;

  select * into g from public.guests where slug = lower(btrim(p_slug));
  if not found then
    return null;
  end if;

  if g.opened_at is null then
    update public.guests set opened_at = now() where id = g.id;
  end if;

  if g.sesi in ('akad', 'keduanya') then
    select e.akad into v_akad from public.event_private e where e.id = 1;
    if v_akad is null or not (v_akad ? 'mulai') then
      v_akad := null;
    end if;
  end if;

  select * into r from public.rsvp where guest_id = g.id;
  if found then
    v_rsvp := jsonb_build_object('status', r.status, 'jumlah_orang', r.jumlah_orang);
  end if;

  return jsonb_build_object(
    'nama',    g.nama,
    'sapaan',  g.sapaan,
    'sesi',    g.sesi,
    'max_pax', g.max_pax,
    'akad',    v_akad,
    'rsvp',    v_rsvp
  );
end;
$$;

create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'wishes_frozen', s.wishes_frozen,
    'rsvp_deadline', s.rsvp_deadline
  )
  from public.settings s where s.id = 1;
$$;

-- Feed ucapan dengan cursor (created_at, id), terbaru di atas.
create or replace function public.list_wishes(
  p_before_created timestamptz default null,
  p_before_id      bigint      default null,
  p_limit          int         default 15
)
returns table (
  id          bigint,
  nama        text,
  pesan       text,
  created_at  timestamptz,
  is_guest    boolean,
  rsvp_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.nama, w.pesan, w.created_at, w.guest_id is not null, r.status
  from public.wishes w
  left join public.rsvp r on r.guest_id = w.guest_id
  where w.is_hidden = false
    and (
      p_before_created is null
      or (w.created_at, w.id) < (p_before_created, coalesce(p_before_id, 9223372036854775807))
    )
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 15), 1), 30);
$$;

-- ---------------------------------------------------------------------
-- RPC internal (hanya service_role, dipanggil Edge Function submit-wish)
-- ---------------------------------------------------------------------

-- Fixed-window rate limit. true = boleh lanjut.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rl.window_start < v_cutoff then now() else rl.window_start end,
    count        = case when rl.window_start < v_cutoff then 1 else rl.count + 1 end
  returning rl.count into v_count;

  -- Bersih-bersih ringan.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- RSVP (upsert) + ucapan dalam satu transaksi.
-- Mengembalikan {ok:true, wish, rsvp, hidden} atau {ok:false, error:<kode>}.
create or replace function public.submit_entry(
  p_slug     text,
  p_nama     text,
  p_pesan    text,
  p_status   text,
  p_jumlah   int,
  p_ip_hash  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.settings;
  g          public.guests;
  has_guest  boolean := false;
  has_msg    boolean := coalesce(btrim(p_pesan), '') <> '';
  want_rsvp  boolean;
  v_jumlah   int;
  v_rsvp     jsonb;
  w          public.wishes;
  v_wish     jsonb;
begin
  select * into s from public.settings where id = 1;

  if p_slug is not null and btrim(p_slug) <> '' then
    select * into g from public.guests where slug = lower(btrim(p_slug));
    has_guest := found;
  end if;

  -- Tamu tanpa slug valid tidak boleh RSVP.
  want_rsvp := has_guest and p_status is not null;

  if not has_msg and not want_rsvp then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if has_msg and s.wishes_frozen then
    return jsonb_build_object('ok', false, 'error', 'wishes_frozen');
  end if;
  if coalesce(length(btrim(p_nama)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if has_msg and length(btrim(p_pesan)) > 500 then
    return jsonb_build_object('ok', false, 'error', 'message_too_long');
  end if;

  if want_rsvp then
    if s.rsvp_deadline is not null and now() > s.rsvp_deadline then
      return jsonb_build_object('ok', false, 'error', 'rsvp_closed');
    end if;
    if p_status not in ('hadir', 'tidak', 'ragu') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
    v_jumlah := case when p_status = 'tidak' then 0 else coalesce(p_jumlah, 0) end;
    if p_status <> 'tidak' and (v_jumlah < 1 or v_jumlah > g.max_pax) then
      return jsonb_build_object('ok', false, 'error', 'invalid_pax');
    end if;

    insert into public.rsvp (guest_id, status, jumlah_orang)
    values (g.id, p_status, v_jumlah)
    on conflict (guest_id) do update
      set status = excluded.status, jumlah_orang = excluded.jumlah_orang;

    v_rsvp := jsonb_build_object('status', p_status, 'jumlah_orang', v_jumlah);
  end if;

  if has_msg then
    insert into public.wishes (guest_id, nama, pesan, is_hidden, ip_hash)
    values (
      case when has_guest then g.id end,
      btrim(p_nama),
      btrim(p_pesan),
      s.moderation_mode,
      p_ip_hash
    )
    returning * into w;
    v_wish := public.wish_public_json(w);
  end if;

  return jsonb_build_object(
    'ok',     true,
    'wish',   v_wish,
    'rsvp',   v_rsvp,
    'hidden', coalesce(w.is_hidden, false)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Hak akses & RLS
-- ---------------------------------------------------------------------

alter table public.guests        enable row level security;
alter table public.rsvp          enable row level security;
alter table public.wishes        enable row level security;
alter table public.rate_limits   enable row level security;
alter table public.settings      enable row level security;
alter table public.event_private enable row level security;
alter table public.admins        enable row level security;

-- anon tidak punya akses tabel langsung sama sekali; hanya lewat RPC.
revoke all on public.guests, public.rsvp, public.wishes, public.rate_limits,
              public.settings, public.event_private, public.admins from anon;
-- rate_limits & admins tidak pernah ditulis dari client.
revoke all on public.rate_limits from authenticated;
revoke insert, update, delete on public.admins from authenticated;

create policy admin_all on public.guests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.rsvp
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.wishes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.event_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy self_read on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Fungsi: default Postgres memberi EXECUTE ke PUBLIC — cabut semuanya dulu.
-- (slugify tetap boleh: dipanggil trigger guests_set_slug dengan hak si peng-insert.)
revoke execute on function
  public.guests_set_slug(),
  public.touch_updated_at(),
  public.is_admin(),
  public.wish_public_json(public.wishes),
  public.wishes_broadcast(),
  public.get_guest(text),
  public.get_public_settings(),
  public.list_wishes(timestamptz, bigint, int),
  public.hit_rate_limit(text, int, int),
  public.submit_entry(text, text, text, text, int, text)
from public, anon, authenticated;

grant execute on function public.get_guest(text)                             to anon, authenticated;
grant execute on function public.get_public_settings()                       to anon, authenticated;
grant execute on function public.list_wishes(timestamptz, bigint, int)       to anon, authenticated;
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.hit_rate_limit(text, int, int)              to service_role;
grant execute on function public.submit_entry(text, text, text, text, int, text) to service_role;
