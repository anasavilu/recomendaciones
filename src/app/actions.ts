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

/**
 * La ficha se pide al catálogo desde el servidor (no nos fiamos de lo que manda el navegador).
 * Si el catálogo no responde, se usa la ficha que ya tengamos guardada o, en último caso,
 * una mínima con el título que se eligió, para no perder la recomendación.
 */
async function catalogIdFor(ref: CatalogDetails, formData: FormData): Promise<string> {
  try {
    return await upsertCatalogItem(await fetchDetails(ref.source, ref.source_id!));
  } catch (e) {
    console.warn(`[guardar] No se pudo pedir la ficha a ${ref.source}:`, (e as Error).message);
    const admin = createAdminClient();
    const { data: known } = await admin
      .from("catalog_items")
      .select("id")
      .eq("source", ref.source)
      .eq("source_id", ref.source_id!)
      .maybeSingle();
    if (known) return known.id;

    const kind = String(formData.get("picked_kind")) as Kind;
    const title = String(formData.get("picked_title") ?? "").trim().slice(0, 300);
    if (!KINDS.includes(kind) || !title) throw e;
    const sub = String(formData.get("picked_sub") ?? "").trim().slice(0, 200) || null;
    return upsertCatalogItem({
      kind,
      source: ref.source,
      source_id: ref.source_id,
      title,
      address: kind === "restaurante" ? sub : null,
      creators: kind === "libro" && sub && sub !== "Autor desconocido" ? sub.split(", ") : [],
    });
  }
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
    details = { kind: "otro", source, source_id: String(formData.get("source_id") ?? ""), title: "" };
  }

  const catalogItemId = details.source === "manual" ? await upsertCatalogItem(details) : await catalogIdFor(details, formData);

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

/** 👍 / 👎 «¿Lo recomendarías?»; null lo deja sin valorar. */
export async function setWouldRecommend(entryId: string, value: boolean | null) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("entries")
    .update({ would_recommend: value })
    .eq("id", entryId)
    .eq("owner_id", user.id);
  if (error) throw error;
  // Sin revalidatePath: en una acción refresca la página al momento y la fila desaparecería
}

/**
 * Tic de la lista: marca como hecho, o lo devuelve al estado anterior.
 * No refresca la página al momento, para dar unos segundos de "Deshacer".
 */
export async function markDone(entryId: string, status: Status) {
  if (!STATUSES.includes(status)) throw new Error("Estado no válido");
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("entries")
    .update({ status })
    .eq("id", entryId)
    .eq("owner_id", user.id);
  if (error) throw error;
  // Sin revalidatePath a propósito: refrescaría la lista al instante y no daría tiempo a "Deshacer".
  // La fila pide el refresco ella misma pasados unos segundos.
}

/** Eliminar desde la lista (deslizando). Sin redirigir ni refrescar: la fila gestiona el "Deshacer". */
export async function removeEntry(entryId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("entries").delete().eq("id", entryId).eq("owner_id", user.id);
  if (error) throw error;
}
