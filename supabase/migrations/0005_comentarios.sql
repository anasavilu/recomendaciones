-- =========================================================
-- 0005 · Comentarios de los usuarios (además de enviarse por correo)
-- =========================================================
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  message     text not null check (char_length(message) between 1 and 4000),
  page        text,
  emailed     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Cada usuario puede enviar comentarios a su nombre; nadie los lee desde la app
drop policy if exists "enviar comentarios" on public.feedback;
create policy "enviar comentarios" on public.feedback for insert to authenticated
  with check (user_id = auth.uid());
