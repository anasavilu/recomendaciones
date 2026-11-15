import "server-only";
import { createAdminClient } from "../supabase/server";
import { fetchDetails } from ".";

type Item = { id: string; source: string; source_id: string | null; extra: Record<string, unknown> | null; links: Record<string, string> | null };

/** Fichas guardadas antes de que trajéramos la nota (pelis, series, documentales y libros). */
export function needsRating(c: Item): boolean {
  if (!c.source_id) return false;
  const extra = c.extra ?? {};
  if (c.source === "tmdb") return !("tmdb_votes" in extra);
  if (c.source === "google_books" || c.source === "openlibrary") return !("book_rated_at" in extra);
  return false;
}

/** Pide la ficha al catálogo y guarda la nota (y enlaces nuevos, como IMDb) sin tocar lo demás. */
export async function refreshRating(c: Item): Promise<Item | null> {
  try {
    const fresh = await fetchDetails(c.source, c.source_id!);
    const { data } = await createAdminClient()
      .from("catalog_items")
      .update({ extra: { ...(c.extra ?? {}), ...fresh.extra }, links: { ...(c.links ?? {}), ...fresh.links } })
      .eq("id", c.id)
      .select("*")
      .single();
    return data as Item | null;
  } catch (e) {
    console.warn("[notas] No se pudo actualizar", c.source, c.source_id, (e as Error).message);
    return null;
  }
}

/** Pone al día unas cuantas fichas cada vez (se llama después de enseñar la lista). */
export async function refreshRatings(items: Item[], max = 12) {
  const todo = [...new Map(items.filter(needsRating).map((c) => [c.id, c])).values()].slice(0, max);
  for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(refreshRating));
}
