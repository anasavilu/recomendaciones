import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryRow } from "./entry-format";

type CatalogItem = EntryRow["catalog_items"];

export type PublicProfile = { id: string; username: string; display_name: string; is_public: boolean; shows: "todo" | "recomendados" };
export type FollowState = "nada" | "pendiente" | "aceptado";
export type ProfileEntry = {
  id: string;
  status: "pendiente" | "en_curso" | "hecho" | "descartado";
  would_recommend: boolean | null;
  created_at: string;
  item: Pick<CatalogItem, "id" | "kind" | "source" | "source_id" | "title" | "original_title" | "year" | "creators" | "genres" | "image_url" | "address" | "extra">;
};

export async function profileByUsername(supabase: SupabaseClient, username: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,is_public,shows")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

/** Cómo está mi relación con ese usuario (yo → él). */
export async function followState(supabase: SupabaseClient, me: string, other: string): Promise<FollowState> {
  const { data } = await supabase.from("follows").select("status").eq("follower_id", me).eq("followee_id", other).maybeSingle();
  return (data?.status as FollowState | undefined) ?? "nada";
}
