import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { norm } from "./text";

import { personOf, type EntryRow } from "./entry-format";
export * from "./entry-format";

/** Devuelve los ids de las filas con esos nombres, creando las que falten. */
async function ensureNamed(
  supabase: SupabaseClient,
  table: "tags" | "recommenders",
  ownerId: string,
  names: string[],
): Promise<string[]> {
  if (!names.length) return [];
  let sel = supabase.from(table).select("id,name").eq("owner_id", ownerId);
  if (table === "recommenders") sel = sel.is("linked_profile_id", null);
  const { data: existing, error } = await sel;
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

const USER_TOKEN = /^@([a-z0-9._]{3,24})$/i;

/**
 * Convierte la lista del formulario ("Maribel Verdú", "@ana") en ids de recomendadores.
 * Los @usuario se enlazan al perfil; si no existe ese usuario, se guarda como nombre libre.
 */
async function resolveRecommenders(supabase: SupabaseClient, ownerId: string, tokens: string[]): Promise<string[]> {
  const usernames = tokens.map((t) => USER_TOKEN.exec(t)?.[1].toLowerCase()).filter((u): u is string => Boolean(u));
  const profiles = new Map<string, { id: string; display_name: string }>();
  if (usernames.length) {
    const { data, error } = await supabase.from("profiles").select("id,username,display_name").in("username", usernames);
    if (error) throw error;
    for (const p of data ?? []) if (p.id !== ownerId) profiles.set(p.username, p);
  }

  const free: string[] = [];
  const linked: { id: string; display_name: string }[] = [];
  for (const t of tokens) {
    const u = USER_TOKEN.exec(t)?.[1].toLowerCase();
    const p = u ? profiles.get(u) : undefined;
    if (p) linked.push(p);
    else free.push(u ? t.slice(1) : t);
  }

  const freeIds = await ensureNamed(supabase, "recommenders", ownerId, free);
  const linkedIds: string[] = [];
  for (const p of linked) {
    const { data: existing } = await supabase
      .from("recommenders")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("linked_profile_id", p.id)
      .maybeSingle();
    if (existing) {
      linkedIds.push(existing.id);
      continue;
    }
    const { data: created, error } = await supabase
      .from("recommenders")
      .insert({ owner_id: ownerId, name: p.display_name, linked_profile_id: p.id })
      .select("id")
      .single();
    if (error) throw error;
    linkedIds.push(created.id);
  }

  // Mantener el orden en que se escribieron
  const out: string[] = [];
  let fi = 0, li = 0;
  for (const t of tokens) {
    const u = USER_TOKEN.exec(t)?.[1].toLowerCase();
    out.push(u && profiles.has(u) ? linkedIds[li++] : freeIds[fi++]);
  }
  return [...new Set(out)];
}

export async function setEntryRecommenders(
  supabase: SupabaseClient,
  ownerId: string,
  entryId: string,
  names: string[],
) {
  const ids = await resolveRecommenders(supabase, ownerId, names);
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
  const ids = await resolveRecommenders(supabase, ownerId, names);
  if (ids.length) {
    const { error } = await supabase
      .from("entry_recommendations")
      .upsert(ids.map((recommender_id) => ({ entry_id: entryId, recommender_id, comment: comment || null })), {
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}

/** Etiquetas y personas ya usadas, para sugerirlas en los formularios. */
export async function loadSuggestions(supabase: SupabaseClient) {
  const [{ data: tags }, { data: people }] = await Promise.all([
    supabase.from("tags").select("name").order("name"),
    supabase
      .from("recommenders")
      .select("id,name,linked:profiles!recommenders_linked_profile_id_fkey(username)")
      .order("name"),
  ]);
  return {
    tags: (tags ?? []).map((t) => ({ token: t.name as string, name: t.name as string })),
    people: ((people ?? []) as unknown as EntryRow["entry_recommendations"][number]["recommenders"][]).map(personOf),
  };
}
