-- =========================================================
-- 0008 · Perfiles públicos o privados, y seguir a otros usuarios
-- =========================================================

-- Público: cualquiera con cuenta ve tu lista. Privado: solo quien hayas aceptado.
alter table public.profiles add column if not exists is_public boolean not null default true;
-- Qué se enseña: 'todo' (pendientes y realizados) o 'recomendados' (realizados con 👍)
alter table public.profiles add column if not exists shows text not null default 'todo';
alter table public.profiles drop constraint if exists profiles_shows_check;
alter table public.profiles add constraint profiles_shows_check check (shows in ('todo', 'recomendados'));

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pendiente' check (status in ('pendiente', 'aceptado')),
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee on public.follows (followee_id, status);

alter table public.follows enable row level security;

drop policy if exists "ver mis seguimientos" on public.follows;
create policy "ver mis seguimientos" on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists "seguir" on public.follows;
create policy "seguir" on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
-- Solo quien recibe la solicitud la acepta
drop policy if exists "aceptar solicitudes" on public.follows;
create policy "aceptar solicitudes" on public.follows for update to authenticated
  using (followee_id = auth.uid()) with check (followee_id = auth.uid());
-- Dejar de seguir, rechazar una solicitud o quitar a un seguidor
drop policy if exists "dejar de seguir" on public.follows;
create policy "dejar de seguir" on public.follows for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- Al seguir a un perfil público se acepta solo; a uno privado queda pendiente.
-- (El estado no lo decide quien sigue.)
create or replace function public.follows_set_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := case when (select is_public from public.profiles where id = new.followee_id) then 'aceptado' else 'pendiente' end;
  elsif tg_op = 'UPDATE' then
    -- Solo se puede pasar a aceptado; quien sigue y a quién no cambian
    new.follower_id := old.follower_id;
    new.followee_id := old.followee_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists follows_status on public.follows;
create trigger follows_status before insert or update on public.follows
  for each row execute function public.follows_set_status();

-- Si alguien hace público su perfil, se aceptan las solicitudes que tuviera
create or replace function public.profiles_accept_on_public()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not old.is_public then
    update public.follows set status = 'aceptado' where followee_id = new.id and status = 'pendiente';
  end if;
  return new;
end $$;
drop trigger if exists profiles_public on public.profiles;
create trigger profiles_public after update of is_public on public.profiles
  for each row execute function public.profiles_accept_on_public();

-- ¿Puede quien consulta ver la lista de este usuario?
create or replace function public.can_view_profile(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = owner and p.is_public)
    or exists (select 1 from public.follows f
               where f.follower_id = auth.uid() and f.followee_id = owner and f.status = 'aceptado');
$$;

-- La lista de otro usuario, sin notas, etiquetas ni quién se lo recomendó (eso es privado)
create or replace function public.profile_entries(owner uuid)
returns table (
  id uuid,
  status public.entry_status,
  would_recommend boolean,
  created_at timestamptz,
  item jsonb
)
language sql stable security definer set search_path = public as $$
  select e.id, e.status, e.would_recommend, e.created_at,
    jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'source', c.source, 'source_id', c.source_id, 'title', c.title,
      'original_title', c.original_title, 'year', c.year, 'creators', c.creators, 'genres', c.genres,
      'image_url', c.image_url, 'address', c.address, 'extra', c.extra
    )
  from public.entries e
  join public.catalog_items c on c.id = e.catalog_item_id
  join public.profiles p on p.id = e.owner_id
  where e.owner_id = owner
    and auth.uid() is not null
    and public.can_view_profile(owner)
    and e.status <> 'descartado'
    and (p.shows = 'todo' or (e.status = 'hecho' and e.would_recommend is true) or owner = auth.uid())
  order by e.created_at desc
  limit 300;
$$;

-- Seguidores y seguidos (solo aceptados) para enseñar en el perfil
create or replace function public.follow_counts(owner uuid)
returns table (followers bigint, following bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.follows where followee_id = owner and status = 'aceptado'),
    (select count(*) from public.follows where follower_id = owner and status = 'aceptado');
$$;

revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.profile_entries(uuid) from public, anon;
revoke all on function public.follow_counts(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.profile_entries(uuid) to authenticated;
grant execute on function public.follow_counts(uuid) to authenticated;
grant select, insert, update, delete on public.follows to authenticated;
