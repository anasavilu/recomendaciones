-- =========================================================
-- 0004 · Nueva categoría "Otros lugares" (casas rurales, hoteles, museos…)
-- Ejecutar sola, en su propia consulta.
-- =========================================================
alter type public.item_kind add value if not exists 'lugar' after 'restaurante';
