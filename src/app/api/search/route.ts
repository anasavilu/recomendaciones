import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCatalog } from "@/lib/catalog";
import { searchTmdbFixed } from "@/lib/catalog/tmdb";
import { searchBooks } from "@/lib/catalog/books";
import { searchRestaurants } from "@/lib/catalog/osm";
import { placesEnabled, searchPlaces } from "@/lib/catalog/places";
import { searchEvents } from "@/lib/catalog/events";
import { KINDS, type Candidate, type Kind } from "@/lib/catalog/types";
import { ENTRY_SELECT, type EntryRow } from "@/lib/entries";

export type SearchResponse = {
  mine: EntryRow[];
  catalog: (Candidate & { entryId: string | null })[];
  catalogFailed: boolean;
  /** Título corregido con el que también se ha buscado ("the disident" → "The Dissident") */
  corrected: string | null;
};

/** Busca a la vez en tu lista y en los catálogos (para añadir). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const kindParam = request.nextUrl.searchParams.get("tipo") as Kind | null;
  const kind = kindParam && KINDS.includes(kindParam) ? kindParam : null;
  if (q.length < 2) return NextResponse.json({ mine: [], catalog: [], catalogFailed: false, corrected: null } satisfies SearchResponse);

  const [mine, catalogResult] = await Promise.all([searchMine(supabase, q, kind), searchAllCatalogs(q, kind)]);

  // Marca lo que ya tienes guardado, para enlazarlo en vez de ofrecer añadirlo otra vez
  const saved = new Map<string, string>();
  const ids = catalogResult.results.map((c) => c.source_id);
  if (ids.length) {
    const { data } = await supabase
      .from("entries")
      .select("id,catalog_items!inner(source,source_id)")
      .eq("owner_id", auth.user.id)
      .in("catalog_items.source_id", ids);
    for (const row of (data ?? []) as unknown as { id: string; catalog_items: { source: string; source_id: string } }[])
      saved.set(`${row.catalog_items.source}:${row.catalog_items.source_id}`, row.id);
  }

  return NextResponse.json({
    mine,
    catalog: catalogResult.results.map((c) => ({ ...c, entryId: saved.get(`${c.source}:${c.source_id}`) ?? null })),
    catalogFailed: catalogResult.failed,
    corrected: catalogResult.corrected,
  } satisfies SearchResponse);
}

async function searchMine(supabase: Awaited<ReturnType<typeof createClient>>, q: string, kind: Kind | null) {
  const { data: hits, error } = await supabase.rpc("search_entries", { q, kind_filter: kind });
  if (error || !hits?.length) return [];
  const { data } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .in("id", hits.slice(0, 30).map((h: { id: string }) => h.id))
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as EntryRow[];
}

async function searchAllCatalogs(
  q: string,
  kind: Kind | null,
): Promise<{ results: Candidate[]; failed: boolean; corrected: string | null }> {
  if (kind === "otro") return { results: [], failed: false, corrected: null };
  if (kind === "pelicula" || kind === "serie" || kind === "documental") {
    try {
      const r = await searchTmdbFixed(q, kind);
      return { results: r.results, failed: false, corrected: r.corrected };
    } catch {
      return { results: [], failed: true, corrected: null };
    }
  }
  if (kind) {
    try {
      return { results: await searchCatalog(q, kind), failed: false, corrected: null };
    } catch {
      return { results: [], failed: true, corrected: null };
    }
  }
  // Sin tipo elegido: películas/series/documentales, libros y sitios
  let corrected: string | null = null;
  const settled = await Promise.allSettled([
    searchTmdbFixed(q).then((r) => {
      corrected = r.corrected;
      return r.results.slice(0, 6);
    }),
    searchBooks(q).then((r) => r.slice(0, 5)),
    // Una sola consulta a Google trae restaurantes y otros lugares
    (placesEnabled() ? searchPlaces(q) : searchRestaurants(q)).then((r) => r.slice(0, 4)),
    searchEvents(q).then((r) => r.slice(0, 4)),
  ]);
  const lists = settled.map((s) => (s.status === "fulfilled" ? s.value : []));
  // Si se ha corregido una errata, las pelis van primero: es lo que se buscaba
  if (corrected) {
    const [screen, ...rest] = lists;
    return { results: [...screen, ...interleave(rest)], failed: false, corrected };
  }
  return { results: interleave(lists), failed: settled.every((s) => s.status === "rejected"), corrected };
}

/** Intercalar para que no salgan todas las pelis antes que cualquier libro */
function interleave(lists: Candidate[][]): Candidate[] {
  const results: Candidate[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) results.push(l[i]);
  return results;
}
