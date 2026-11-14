-- =========================================================
-- 0006 · Nueva categoría "Teatro y exposiciones"
-- Ejecutar sola, en su propia consulta.
-- =========================================================
alter type public.item_kind add value if not exists 'evento' after 'lugar';
