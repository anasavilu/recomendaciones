"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { siteOrigin, USERNAME_RE } from "@/lib/origin";

export type AuthState = { error?: string; info?: string; values?: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRONG = "Usuario o contraseña incorrectos.";

/** Busca el correo de un @usuario (solo en el servidor, nunca se devuelve al navegador). */
async function emailForUsername(username: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!p) return null;
  const { data } = await admin.auth.admin.getUserById(p.id);
  return data.user?.email ?? null;
}

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const identifier = String(fd.get("identifier") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const values = { identifier };
  if (!identifier || !password) return { error: "Escribe tu usuario o correo y tu contraseña.", values };

  const email = EMAIL_RE.test(identifier)
    ? identifier.toLowerCase()
    : await emailForUsername(identifier.replace(/^@/, "").toLowerCase());
  if (!email) return { error: WRONG, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed")
      return { error: "Aún no has confirmado tu correo. Busca el mensaje que te enviamos al registrarte.", values };
    return { error: WRONG, values };
  }
  redirect("/");
}

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const name = String(fd.get("name") ?? "").trim();
  const username = String(fd.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const values = { name, username, email };

  if (!name) return { error: "Escribe tu nombre.", values };
  if (!USERNAME_RE.test(username))
    return { error: "El usuario debe tener entre 3 y 24 caracteres: letras minúsculas, números, punto o guion bajo.", values };
  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo válido.", values };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", values };

  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return { error: `El usuario @${username} ya existe. Prueba con otro.`, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
      data: { display_name: name, username },
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "Ya hay una cuenta con ese correo. Entra con él.", values };
    if (error.code === "weak_password") return { error: "Esa contraseña es demasiado fácil. Prueba con otra más larga.", values };
    return { error: "No se ha podido crear la cuenta. Prueba de nuevo en un minuto.", values };
  }
  if (data.session) redirect("/");
  return { info: `Te hemos enviado un correo a ${email}. Ábrelo para confirmar tu cuenta y entrar.` };
}

export async function requestPasswordReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Escribe el correo de tu cuenta.", values: { email } };
  const supabase = await createClient();
  const next = encodeURIComponent("/cuenta?restablecer=1");
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/callback?next=${next}` });
  // Mismo mensaje exista o no la cuenta
  return { info: `Si ${email} tiene cuenta, te llegará un enlace para elegir una contraseña nueva.` };
}
