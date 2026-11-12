-- =========================================================
-- 0003 · "¿Lo recomendarías?" (👍 / 👎) en lo ya hecho
-- =========================================================

-- true = 👍 lo recomendaría · false = 👎 no lo recomendaría · null = sin valorar
alter table public.entries add column if not exists would_recommend boolean;

create index if not exists entries_owner_recommend
  on public.entries (owner_id, would_recommend)
  where would_recommend is not null;

-- La búsqueda encuentra lo que recomendarías escribiendo "recomendaría" o "recomendable"
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
        case e.would_recommend when true then 'recomendaria recomendable' when false then 'desaconsejado' end,
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
