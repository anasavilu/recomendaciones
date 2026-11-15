"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

const refresh = () => {
  revalidatePath("/gente");
  revalidatePath("/u/[username]", "page");
  revalidatePath("/cuenta");
};

/** Seguir a alguien: si su perfil es público queda aceptado al momento; si no, pendiente. */
export async function follow(userId: string) {
  const { supabase, user } = await requireUser();
  if (userId === user.id) return;
  await supabase.from("follows").upsert({ follower_id: user.id, followee_id: userId }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true });
  refresh();
}

/** Dejar de seguir o cancelar una solicitud. */
export async function unfollow(userId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", userId);
  refresh();
}

export async function acceptFollower(userId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("follows").update({ status: "aceptado" }).eq("followee_id", user.id).eq("follower_id", userId);
  refresh();
}

/** Rechazar una solicitud o quitar a alguien que te sigue. */
export async function removeFollower(userId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("follows").delete().eq("followee_id", user.id).eq("follower_id", userId);
  refresh();
}

export type PrivacyState = { ok?: string; error?: string };

export async function updatePrivacy(_prev: PrivacyState, fd: FormData): Promise<PrivacyState> {
  const { supabase, user } = await requireUser();
  const is_public = fd.get("visibility") !== "privado";
  const shows = fd.get("shows") === "recomendados" ? "recomendados" : "todo";
  const { error } = await supabase.from("profiles").update({ is_public, shows }).eq("id", user.id);
  if (error) return { error: "No se ha podido guardar. Prueba otra vez." };
  refresh();
  return { ok: "Guardado." };
}
