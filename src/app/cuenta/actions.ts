"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { USERNAME_RE } from "@/lib/origin";

export type FormState = { error?: string; ok?: string };

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const display_name = String(fd.get("name") ?? "").trim();
  const username = String(fd.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!display_name) return { error: "Escribe tu nombre." };
  if (!USERNAME_RE.test(username))
    return { error: "El usuario debe tener entre 3 y 24 caracteres: letras minúsculas, números, punto o guion bajo." };

  const { error } = await supabase.from("profiles").update({ display_name, username }).eq("id", user.id);
  if (error?.code === "23505") return { error: `El usuario @${username} ya existe. Prueba con otro.` };
  if (error) return { error: "No se han podido guardar los cambios." };
  revalidatePath("/cuenta");
  return { ok: "Datos guardados." };
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const password = String(fd.get("password") ?? "");
  const repeat = String(fd.get("repeat") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== repeat) return { error: "Las dos contraseñas no coinciden." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error?.code === "same_password") return { error: "Es la misma contraseña que ya tenías." };
  if (error?.code === "weak_password") return { error: "Esa contraseña es demasiado fácil. Prueba con otra más larga." };
  if (error) return { error: "No se ha podido cambiar la contraseña. Vuelve a entrar e inténtalo de nuevo." };
  return { ok: "Contraseña cambiada." };
}
