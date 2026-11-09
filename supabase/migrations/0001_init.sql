-- =========================================================
-- Recomendados · modelo de datos inicial (fase 1)
-- =========================================================
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Wrapper inmutable de unaccent (necesario para índices)
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe as
$$ select extensions.unaccent('extensions.unaccent', $1) $$;

-- ---------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  phone_e164    text unique,          -- para el bot de WhatsApp (fase 3)
  created_at    timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Catálogo compartido (caché de fichas de TMDB, libros, etc.)
-- Una peli existe una sola vez aunque la guarden mil usuarios.
-- ---------------------------------------------------------
create type public.item_kind as enum ('pelicula', 'serie', 'documental', 'libro', 'restaurante', 'otro');

create table public.catalog_items (
  id            uuid primary key default gen_random_uuid(),
  kind          public.item_kind not null,
  source        text not null,        -- 'tmdb' | 'google_books' | 'openlibrary' | 'manual' ...
  source_id     text,                 -- id en la fuente (null si manual)
  title         text not null,
  original_title text,
  year          int,
  creators      text[] default '{}',  -- director/es, autor/es
  genres        text[] default '{}',  -- géneros del catálogo, en español
  summary       text,
  image_url     text,
  address       text,                 -- restaurantes
  links         jsonb not null default '{}', -- { "filmaffinity": "...", "web": "...", "maps": "..." }
  extra         jsonb not null default '{}', -- datos específicos de cada fuente
  created_at    timestamptz not null default now(),
  unique (source, source_id)
);

create index catalog_items_title_trgm on public.catalog_items
  using gin (public.f_unaccent(lower(title)) extensions.gin_trgm_ops);

-- ---------------------------------------------------------
-- La lista de cada usuario
-- ---------------------------------------------------------
create type public.entry_status as enum ('pendiente', 'en_curso', 'hecho', 'descartado');

create table public.entries (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id),
  status          public.entry_status not null default 'pendiente',
  rating          smallint check (rating between 1 and 5),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, catalog_item_id)
);

create index entries_owner on public.entries(owner_id, created_at desc);

-- ---------------------------------------------------------
-- Quién recomienda: personas en la agenda de cada usuario.
-- Puede ser un nombre libre ("Maribel Verdú") o estar enlazado
-- a otro usuario de la app ("Ana", con su perfil).
-- ---------------------------------------------------------
create table public.recommenders (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create unique index recommenders_owner_name
  on public.recommenders(owner_id, public.f_unaccent(lower(name)));

-- Una entrada puede venir recomendada por varias personas
create table public.entry_recommendations (
  entry_id        uuid not null references public.entries(id) on delete cascade,
  recommender_id  uuid not null references public.recommenders(id) on delete cascade,
  comment         text,
  recommended_at  timestamptz not null default now(),
  primary key (entry_id, recommender_id)
);

-- ---------------------------------------------------------
-- Etiquetas propias del usuario
-- ---------------------------------------------------------
create table public.tags (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references public.profiles(id) on delete cascade,
  name      text not null
);

create unique index tags_owner_name
  on public.tags(owner_id, public.f_unaccent(lower(name)));

create table public.entry_tags (
  entry_id  uuid not null references public.entries(id) on delete cascade,
  tag_id    uuid not null references public.tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);

-- ---------------------------------------------------------
-- Búsqueda: título, autores, géneros del catálogo, etiquetas,
-- notas y quién lo recomendó. Sin acentos y sin mayúsculas.
-- "comedia romántica" encuentra lo etiquetado o con ese género.
-- ---------------------------------------------------------
create or replace function public.search_entries(q text, kind_filter public.item_kind default null)
returns setof public.entries
language sql stable security invoker as $$
  with terms as (
    select t from unnest(string_to_array(public.f_unaccent(lower(trim(q))), ' ')) as t
    where t <> ''
  ),
  docs as (
    select e.id,
      public.f_unaccent(lower(concat_ws(' ',
        c.title, c.original_title,
        array_to_string(c.creators, ' '),
        array_to_string(c.genres, ' '),
        e.notes,
        (select string_agg(tg.name, ' ') from public.entry_tags et join public.tags tg on tg.id = et.tag_id where et.entry_id = e.id),
        (select string_agg(r.name, ' ') from public.entry_recommendations er join public.recommenders r on r.id = er.recommender_id where er.entry_id = e.id)
      ))) as doc
    from public.entries e
    join public.catalog_items c on c.id = e.catalog_item_id
    where e.owner_id = auth.uid()
      and (kind_filter is null or c.kind = kind_filter)
  )
  select e.* from public.entries e
  join docs d on d.id = e.id
  where not exists (select 1 from terms where position(terms.t in d.doc) = 0)
  order by e.created_at desc;
$$;

-- ---------------------------------------------------------
-- Seguridad a nivel de fila: cada usuario sólo ve lo suyo
-- ---------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.catalog_items         enable row level security;
alter table public.entries               enable row level security;
alter table public.recommenders          enable row level security;
alter table public.entry_recommendations enable row level security;
alter table public.tags                  enable row level security;
alter table public.entry_tags            enable row level security;

-- Perfiles: cualquiera logueado ve nombres (para enlazar "viene de Ana"); sólo editas el tuyo
create policy "perfiles visibles" on public.profiles for select to authenticated using (true);
create policy "editar mi perfil"  on public.profiles for update to authenticated using (id = auth.uid());

-- Catálogo: lectura para todos los logueados; altas sólo desde el servidor (service role)
create policy "catalogo lectura" on public.catalog_items for select to authenticated using (true);

create policy "mis entradas" on public.entries for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "mis recomendadores" on public.recommenders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "mis etiquetas" on public.tags for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "recomendaciones de mis entradas" on public.entry_recommendations for all to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = auth.uid()))
  with check (
    exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = auth.uid())
    and exists (select 1 from public.recommenders r where r.id = recommender_id and r.owner_id = auth.uid())
  );

create policy "etiquetas de mis entradas" on public.entry_tags for all to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = auth.uid()))
  with check (
    exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = auth.uid())
    and exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = auth.uid())
  );

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();
