-- =========================================================
-- 0002 · Nombre de usuario y recomendadores que son usuarios
-- =========================================================

-- Nombre de usuario único (@ana): minúsculas, números, punto y guion bajo
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9._]{3,24}$');
create unique index profiles_username_key on public.profiles (username);

-- El registro guarda username y nombre que vienen en los metadatos
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    lower(nullif(new.raw_user_meta_data->>'username', ''))
  );
  return new;
end $$;

-- Un recomendador es o un nombre libre ("Maribel Verdú") o un usuario enlazado (@ana).
-- Los nombres libres no se repiten; cada usuario enlazado aparece una sola vez.
drop index if exists public.recommenders_owner_name;
create unique index recommenders_owner_free_name
  on public.recommenders (owner_id, public.f_unaccent(lower(name)))
  where linked_profile_id is null;
create unique index recommenders_owner_linked
  on public.recommenders (owner_id, linked_profile_id)
  where linked_profile_id is not null;

-- Buscar usuarios para elegirlos como recomendador (no te incluye a ti)
create or replace function public.find_profiles(q text)
returns table (id uuid, username text, display_name text)
language sql stable security invoker as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.id <> auth.uid()
    and p.username is not null
    and length(trim(ltrim(q, '@'))) >= 2
    and (
      p.username like lower(trim(ltrim(q, '@'))) || '%'
      or public.f_unaccent(lower(p.display_name)) like '%' || public.f_unaccent(lower(trim(q))) || '%'
    )
  order by (p.username = lower(trim(ltrim(q, '@')))) desc, p.username
  limit 8;
$$;

-- La búsqueda de la lista también encuentra por @usuario del recomendador
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
        (select string_agg(concat_ws(' ', r.name, '@' || p.username), ' ')
           from public.entry_recommendations er
           join public.recommenders r on r.id = er.recommender_id
           left join public.profiles p on p.id = r.linked_profile_id
          where er.entry_id = e.id)
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
