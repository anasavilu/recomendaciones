import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_LABEL } from "@/lib/catalog/types";
import { doneLabel, personOf, STATUS_LABEL, type EntryRow } from "@/lib/entry-format";
import { ENTRY_SELECT } from "@/lib/entries";
import { facetValues } from "@/lib/facets";

const MAX_ENTRIES = 400;

/** Una línea compacta por entrada, para que el asistente conozca la lista. */
function line(e: EntryRow): string {
  const c = e.catalog_items;
  const status = e.status === "hecho" ? doneLabel(c.kind) : STATUS_LABEL[e.status];
  const who = e.entry_recommendations.map((r) => {
    const p = personOf(r.recommenders);
    return p.username ? `${p.name} (@${p.username})` : p.name;
  });
  const comments = e.entry_recommendations.filter((r) => r.comment).map((r) => `«${r.comment}» (${r.recommenders.name})`);
  const parts = [
    `${KIND_LABEL[c.kind]}: ${c.title}${c.year ? ` (${c.year})` : ""}`,
    c.creators?.length ? `de ${c.creators.slice(0, 2).join(", ")}` : null,
    c.address ? `en ${c.address}` : null,
    `estado: ${status}`,
    e.would_recommend === true ? "lo recomendaría 👍" : e.would_recommend === false ? "no lo recomendaría 👎" : null,
    facetValues(e, "genero").length ? `tipo/género: ${facetValues(e, "genero").join(", ")}` : null,
    facetValues(e, "plataforma").length ? `plataformas: ${facetValues(e, "plataforma").join(", ")}` : null,
    who.length ? `recomendado por: ${who.join(", ")}` : null,
    e.entry_tags.length ? `etiquetas: ${e.entry_tags.map((t) => t.tags.name).join(", ")}` : null,
    comments.length ? `le dijeron: ${comments.join("; ")}` : null,
    e.notes ? `notas: ${e.notes.replace(/\s+/g, " ").slice(0, 200)}` : null,
  ];
  return "- " + parts.filter(Boolean).join(" · ");
}

export async function buildListContext(supabase: SupabaseClient, userId: string) {
  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("entries")
      .select(ENTRY_SELECT)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES),
    supabase.from("profiles").select("display_name,username").eq("id", userId).single(),
  ]);
  const entries = (data ?? []) as unknown as EntryRow[];
  return {
    name: profile?.display_name ?? "",
    count: entries.length,
    text: entries.length ? entries.map(line).join("\n") : "(La lista está vacía todavía.)",
  };
}
