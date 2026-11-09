"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireUser } from "@/lib/supabase/server";
import { fetchDetails } from "@/lib/catalog";
import { KINDS, type CatalogDetails, type Kind } from "@/lib/catalog/types";
import {
  addEntryRecommenders,
  addEntryTags,
  setEntryRecommenders,
  setEntryTags,
  type Status,
} from "@/lib/entries";
import { splitList } from "@/lib/text";

const STATUSES: Status[] = ["pendiente", "en_curso", "hecho", "descartado"];

/** Guarda (o reutiliza) la ficha en el catálogo compartido y devuelve su id. */
async function upsertCatalogItem(details: CatalogDetails): Promise<string> {
  const admin = createAdminClient();
  if (details.source_id) {
    const { data, error } = await admin
      .from("catalog_items")
      .upsert(details, { onConflict: "source,source_id" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const { data, error } = await admin.from("catalog_items").insert(details).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function addEntry(formData: FormData) {
  const { supabase, user } = await requireUser();

  const source = String(formData.get("source") ?? "manual");
  let details: CatalogDetails;

  if (source === "manual") {
    const kind = String(formData.get("kind")) as Kind;
    const title = String(formData.get("title") ?? "").trim();
    if (!KINDS.includes(kind)) throw new Error("Tipo no válido");
    if (!title) throw new Error("Falta el título");
    const yearRaw = Number(formData.get("year"));
    const link = String(formData.get("link") ?? "").trim();
    const author = String(formData.get("creator") ?? "").trim();
    details = {
      kind,
      source: "manual",
      source_id: null,
      title,
      year: Number.isInteger(yearRaw) && yearRaw > 1000 ? yearRaw : null,
      creators: author ? [author] : [],
      address: String(formData.get("address") ?? "").trim() || null,
      links: /^https?:\/\//.test(link) ? { web: link } : {},
    };
  } else {
    // La ficha se resuelve en el servidor: no nos fiamos de datos de catálogo enviados por el navegador.
    details = await fetchDetails(source, String(formData.get("source_id")));
  }

  const catalogItemId = await upsertCatalogItem(details);

  // Si ya estaba en tu lista, se suma la recomendación en vez de duplicar.
  const { data: existing } = await supabase
    .from("entries")
    .select("id")
    .eq("owner_id", user.id)
    .eq("catalog_item_id", catalogItemId)
    .maybeSingle();

  let entryId = existing?.id as string | undefined;
  if (!entryId) {
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const { data, error } = await supabase
      .from("entries")
      .insert({ owner_id: user.id, catalog_item_id: catalogItemId, notes })
      .select("id")
      .single();
    if (error) throw error;
    entryId = data.id as string;
  }

  await addEntryRecommenders(
    supabase,
    user.id,
    entryId,
    splitList(String(formData.get("recommenders") ?? "")),
    String(formData.get("comment") ?? "").trim(),
  );
  await addEntryTags(supabase, user.id, entryId, splitList(String(formData.get("tags") ?? "")));

  revalidatePath("/");
  redirect(`/e/${entryId}${existing ? "?ya=1" : ""}`);
}

export async function updateEntry(entryId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const patch: Record<string, unknown> = {};
  if (formData.has("status")) {
    const s = String(formData.get("status")) as Status;
    if (STATUSES.includes(s)) patch.status = s;
  }
  if (formData.has("notes")) patch.notes = String(formData.get("notes")).trim() || null;
  if (formData.has("rating")) {
    const r = Number(formData.get("rating"));
    patch.rating = r >= 1 && r <= 5 ? r : null;
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("entries").update(patch).eq("id", entryId).eq("owner_id", user.id);
    if (error) throw error;
  }
  if (formData.has("tags")) await setEntryTags(supabase, user.id, entryId, splitList(String(formData.get("tags"))));
  if (formData.has("recommenders"))
    await setEntryRecommenders(supabase, user.id, entryId, splitList(String(formData.get("recommenders"))));

  revalidatePath("/");
  revalidatePath(`/e/${entryId}`);
}

export async function setStatus(entryId: string, status: Status) {
  const fd = new FormData();
  fd.set("status", status);
  await updateEntry(entryId, fd);
}

export async function deleteEntry(entryId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("entries").delete().eq("id", entryId).eq("owner_id", user.id);
  if (error) throw error;
  revalidatePath("/");
  redirect("/");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}
