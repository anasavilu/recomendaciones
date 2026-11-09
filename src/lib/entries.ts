import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kind } from "./catalog/types";
import { norm } from "./text";

export type Status = "pendiente" | "en_curso" | "hecho" | "descartado";

export type EntryRow = {
  id: string;
  status: Status;
  rating: number | null;
  notes: string | null;
  created_at: string;
  catalog_items: {
    id: string;
    kind: Kind;
    source: string;
    title: string;
    original_title: string | null;
    year: number | null;
    creators: string[];
    genres: string[];
    summary: string | null;
    image_url: string | null;
    address: string | null;
    links: Record<string, string>;
    extra: Record<string, unknown>;
  };
  entry_tags: { tags: { id: string; name: string } }[];
  entry_recommendations: { comment: string | null; recommenders: { id: string; name: string } }[];
};

export const ENTRY_SELECT =
  "id,status,rating,notes,created_at,catalog_items(*),entry_tags(tags(id,name)),entry_recommendations(comment,recommenders(id,name))";

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: "Pendiente",
  en_curso: "Empezado",
  hecho: "Hecho",
  descartado: "Descartado",
};

export function doneLabel(kind: Kind) {
  return kind === "libro" ? "Leído" : kind === "restaurante" ? "Ido" : "Visto";
}

/** Devuelve los ids de las filas con esos nombres, creando las que falten. */
async function ensureNamed(
  supabase: SupabaseClient,
  table: "tags" | "recommenders",
  ownerId: string,
  names: string[],
): Promise<string[]> {
  if (!names.length) return [];
  const { data: existing, error } = await supabase.from(table).select("id,name").eq("owner_id", ownerId);
  if (error) throw error;
  const byNorm = new Map((existing ?? []).map((r) => [norm(r.name), r.id as string]));
  const missing = names.filter((n) => !byNorm.has(norm(n)));
  if (missing.length) {
    const { data: created, error: insErr } = await supabase
      .from(table)
      .insert(missing.map((name) => ({ owner_id: ownerId, name })))
      .select("id,name");
    if (insErr) throw insErr;
    for (const r of created ?? []) byNorm.set(norm(r.name), r.id);
  }
  return names.map((n) => byNorm.get(norm(n))!);
}

export async function setEntryTags(supabase: SupabaseClient, ownerId: string, entryId: string, names: string[]) {
  const ids = await ensureNamed(supabase, "tags", ownerId, names);
  await supabase.from("entry_tags").delete().eq("entry_id", entryId);
  if (ids.length) {
    const { error } = await supabase.from("entry_tags").insert(ids.map((tag_id) => ({ entry_id: entryId, tag_id })));
    if (error) throw error;
  }
}

export async function addEntryTags(supabase: SupabaseClient, ownerId: string, entryId: string, names: string[]) {
  const ids = await ensureNamed(supabase, "tags", ownerId, names);
  if (ids.length) {
    await supabase
      .from("entry_tags")
      .upsert(ids.map((tag_id) => ({ entry_id: entryId, tag_id })), { ignoreDuplicates: true });
  }
}

export async function setEntryRecommenders(
  supabase: SupabaseClient,
  ownerId: string,
  entryId: string,
  names: string[],
) {
  const ids = await ensureNamed(supabase, "recommenders", ownerId, names);
  const { data: current } = await supabase.from("entry_recommendations").select("recommender_id").eq("entry_id", entryId);
  const keep = new Set(ids);
  const toDelete = (current ?? []).map((r) => r.recommender_id as string).filter((id) => !keep.has(id));
  if (toDelete.length)
    await supabase.from("entry_recommendations").delete().eq("entry_id", entryId).in("recommender_id", toDelete);
  if (ids.length) {
    const { error } = await supabase
      .from("entry_recommendations")
      .upsert(ids.map((recommender_id) => ({ entry_id: entryId, recommender_id })), { ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function addEntryRecommenders(
  supabase: SupabaseClient,
  ownerId: string,
  entryId: string,
  names: string[],
  comment?: string | null,
) {
  const ids = await ensureNamed(supabase, "recommenders", ownerId, names);
  if (ids.length) {
    const { error } = await supabase
      .from("entry_recommendations")
      .upsert(ids.map((recommender_id) => ({ entry_id: entryId, recommender_id, comment: comment || null })), {
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}
